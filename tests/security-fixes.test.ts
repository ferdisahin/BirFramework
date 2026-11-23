import { test, describe } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { Broadcast, WebSocketClient } from '../src/broadcasting/index.js';
import { Context, PayloadTooLargeError } from '../src/http/context.js';
import { CookieManager, Session, sessionStore } from '../src/auth/session.js';
import { Auth } from '../src/auth/auth.js';
import { rateLimit, rateLimiter } from '../src/security/rate_limiter.js';
import { csrf } from '../src/security/csrf.js';

describe('BirFramework Security Fixes Verification Tests', () => {
  // 1. WebSocket Channel Authorization
  test('WebSocket server should reject unauthorized private channel subscriptions', async () => {
    let sentMessages: any[] = [];
    const mockSocket: any = {
      destroyed: false,
      write() {},
      end() { this.destroyed = true; },
      on() {},
    };

    const client = new WebSocketClient(mockSocket);
    client.send = (data: any) => sentMessages.push(data);

    // Register authorizer for private-user.{id}
    Broadcast.channel('private-user.{id}', (wsClient, params) => {
      return params?.id === 'user-123';
    });

    // A. Unauthorized private channel (no authorizer)
    const canSubSecret = await Broadcast.server.canSubscribe(client, 'private-company-secrets');
    assert.strictEqual(canSubSecret, false);

    // B. Authorized private channel with matching id
    const canSubAllowed = await Broadcast.server.canSubscribe(client, 'private-user.user-123');
    assert.strictEqual(canSubAllowed, true);

    // C. Authorized private channel with wrong id
    const canSubDenied = await Broadcast.server.canSubscribe(client, 'private-user.user-999');
    assert.strictEqual(canSubDenied, false);

    // D. Public channel without private- prefix is open
    const canSubPublic = await Broadcast.server.canSubscribe(client, 'news');
    assert.strictEqual(canSubPublic, true);
  });

  // 2. Request Body Size Limit
  test('Context should reject request exceeding maximum body limit with 413 PayloadTooLargeError', async () => {
    const req: any = new EventEmitter();
    req.method = 'POST';
    req.url = '/upload';
    req.headers = {
      host: 'localhost',
      'content-length': '20000000', // 20 MB
    };
    req.socket = { remoteAddress: '127.0.0.1' };

    let statusCode = 200;
    const res: any = {
      writableEnded: false,
      statusCode: 200,
      setHeader() {},
      writeHead(code: number) { statusCode = code; },
      end() { this.writableEnded = true; },
    };

    const ctx = new Context(req, res);

    await assert.rejects(async () => {
      await ctx.body();
    }, (err: any) => {
      assert.strictEqual(err.name, 'PayloadTooLargeError');
      assert.strictEqual(err.statusCode, 413);
      assert.strictEqual(res.statusCode, 413);
      return true;
    });
  });

  // 3. Session Security
  test('CookieManager in production requires APP_KEY or secret', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.APP_KEY;
    process.env.NODE_ENV = 'production';
    delete process.env.APP_KEY;

    try {
      assert.throws(() => {
        new CookieManager();
      }, /Production environment requires APP_KEY/);
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalKey) process.env.APP_KEY = originalKey;
    }
  });

  test('Session.regenerate rotates session ID and preserves data to prevent fixation', () => {
    const session = new Session();
    session.set('role', 'admin');
    const oldId = session.id;

    const newId = session.regenerate();

    assert.notStrictEqual(newId, oldId);
    assert.strictEqual(session.id, newId);
    assert.strictEqual(session.get('role'), 'admin');
    assert.strictEqual(sessionStore.has(oldId), false);
    assert.strictEqual(sessionStore.has(newId), true);
  });

  test('Auth.login regenerates session ID to prevent session fixation', async () => {
    const session = new Session();
    const oldId = session.id;
    const mockCtx: Partial<Context> = { session };

    await Auth.login(mockCtx as Context, { id: 99 });

    assert.notStrictEqual(session.id, oldId);
    assert.strictEqual(session.get(Auth.sessionKey), 99);
  });

  // 4. Rate Limiter IP Spoofing Prevention
  test('Rate limiter defaults to remoteAddress and ignores spoofed X-Forwarded-For when trustProxy is false', async () => {
    rateLimiter.clear();
    const middleware = rateLimit({ max: 2, windowMs: 60000, trustProxy: false });

    const createMockReq = (spoofedIp: string) => {
      const req: any = new EventEmitter();
      req.socket = { remoteAddress: '192.168.1.50' };
      req.headers = { 'x-forwarded-for': spoofedIp };
      let statusCode = 200;
      const res: any = {
        writableEnded: false,
        statusCode: 200,
        setHeader() {},
        writeHead(code: number) { statusCode = code; },
        end() { this.writableEnded = true; },
      };
      return new Context(req, res);
    };

    let nextCount = 0;
    const next = async () => { nextCount++; };

    // Request 1 from remoteAddress with fake IP 1.1.1.1
    const ctx1 = createMockReq('1.1.1.1');
    await middleware(ctx1, next);
    assert.strictEqual(nextCount, 1);

    // Request 2 from remoteAddress with fake IP 2.2.2.2
    const ctx2 = createMockReq('2.2.2.2');
    await middleware(ctx2, next);
    assert.strictEqual(nextCount, 2);

    // Request 3 from remoteAddress with fake IP 3.3.3.3 -> Should be BLOCKED (429) because remoteAddress exceeded limit!
    const ctx3 = createMockReq('3.3.3.3');
    await middleware(ctx3, next);
    assert.strictEqual(nextCount, 2); // next() not called
    assert.strictEqual(ctx3.res.statusCode, 429);
  });

  // 5. CSRF Missing Session
  test('CSRF middleware rejects POST requests with 403 Forbidden when session middleware is missing', async () => {
    const middleware = csrf();

    const req: any = new EventEmitter();
    req.method = 'POST';
    req.url = '/checkout';
    req.headers = { host: 'localhost', accept: 'application/json' };
    req.socket = { remoteAddress: '127.0.0.1' };

    let statusCode = 200;
    let jsonBody: any = null;
    const res: any = {
      writableEnded: false,
      statusCode: 200,
      setHeader() {},
      writeHead(code: number) { statusCode = code; },
      end(chunk?: any) {
        this.writableEnded = true;
        if (chunk) jsonBody = JSON.parse(chunk);
      },
    };

    const ctx = new Context(req, res);
    // ctx.session is undefined!

    let nextCalled = false;
    await middleware(ctx, async () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(ctx.res.statusCode, 403);
    assert.ok(jsonBody.message.includes('CSRF protection is active but no active session was found'));
  });

  test('CSRF middleware allows read-only GET requests even if session is not present', async () => {
    const middleware = csrf();

    const req: any = new EventEmitter();
    req.method = 'GET';
    req.url = '/about';
    req.headers = { host: 'localhost' };
    req.socket = { remoteAddress: '127.0.0.1' };

    const res: any = {
      writableEnded: false,
      statusCode: 200,
      setHeader() {},
      writeHead() {},
      end() {},
    };

    const ctx = new Context(req, res);

    let nextCalled = false;
    await middleware(ctx, async () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
  });
});
