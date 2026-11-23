import { test, describe } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { Broadcast, WebSocketClient, WebSocketServer } from '../src/broadcasting/index.js';
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

  // 6. Session Cookie Updated on Auth.login and Persists Across Next Request
  test('Auth.login updates Set-Cookie with regenerated ID and allows subsequent requests to authenticate', async () => {
    const { Application } = await import('../src/core/application.js');
    const { createTestClient } = await import('../src/testing/index.js');

    const app = new Application();
    app.router.post('/login', async (ctx) => {
      await Auth.login(ctx, { id: 77, name: 'SecureUser' });
      ctx.json({ success: true, sessionId: ctx.session.id });
    });

    app.router.get('/profile', (ctx) => {
      ctx.json({
        authenticated: Auth.check(ctx),
        userId: Auth.id(ctx),
        sessionId: ctx.session?.id,
      });
    });

    const client = createTestClient(app);
    try {
      // 1. Initial login request
      const loginRes = await client.post('/login');
      loginRes.assertOk();

      // Extract Set-Cookie header
      const setCookieHeader = loginRes.headers.get('set-cookie');
      assert.ok(setCookieHeader, 'Set-Cookie header must be present on login response');

      const loginJson = loginRes.json();
      assert.ok(loginJson.sessionId);

      // Verify the cookie contains the regenerated session ID
      assert.ok(
        setCookieHeader.includes(loginJson.sessionId),
        'Set-Cookie must contain the regenerated session ID, not the old ID'
      );

      // 2. Next request (client automatically passes session cookie)
      const profileRes = await client.get('/profile');
      profileRes.assertOk();

      const profileJson = profileRes.json();
      assert.strictEqual(profileJson.authenticated, true, 'User must remain authenticated on subsequent request');
      assert.strictEqual(profileJson.userId, 77);
      assert.strictEqual(profileJson.sessionId, loginJson.sessionId);
    } finally {
      await client.close();
    }
  });

  // 7. WebSocket Message Validation and Async Error Resilience
  test('WebSocket server validates message structure and handles async authorizer rejections safely', async () => {
    let sentMessages: any[] = [];
    const mockSocket: any = {
      destroyed: false,
      write() {},
      end() { this.destroyed = true; },
      on() {},
    };

    const client = new WebSocketClient(mockSocket);
    client.send = (data: any) => sentMessages.push(data);

    // Register authorizer that throws an unexpected async error
    Broadcast.channel('private-failing.{id}', async () => {
      throw new Error('Database connection failed during auth check');
    });

    // A. Send invalid channel type (non-string)
    sentMessages = [];
    (Broadcast.server as any).handleFrame(
      client,
      WebSocketServer.createFrame(JSON.stringify({ event: 'subscribe', channel: 12345 }))
    );
    assert.strictEqual(sentMessages[0]?.event, 'error');
    assert.ok(sentMessages[0]?.message.includes('channel'));

    // B. Send malformed message (array instead of object)
    sentMessages = [];
    (Broadcast.server as any).handleFrame(
      client,
      WebSocketServer.createFrame(JSON.stringify(['not', 'an', 'object']))
    );
    assert.strictEqual(sentMessages[0]?.event, 'error');

    // C. Send subscription to channel whose authorizer throws an async error
    sentMessages = [];
    (Broadcast.server as any).handleFrame(
      client,
      WebSocketServer.createFrame(JSON.stringify({ event: 'subscribe', channel: 'private-failing.1' }))
    );

    // Wait microtask for async authorizer
    await new Promise((r) => setTimeout(r, 20));

    // Must receive subscription_error and process must NOT crash from unhandled rejection
    assert.strictEqual(sentMessages[0]?.event, 'subscription_error');
    assert.strictEqual(sentMessages[0]?.channel, 'private-failing.1');
  });

  // 8. Integration Test for Stream Body Limit (413 Payload Too Large on Chunked Request)
  test('Streaming chunked request exceeding body limit receives 413 Payload Too Large without socket hang up', async () => {
    const http = await import('node:http');
    const { Application } = await import('../src/core/application.js');

    const app = new Application();
    app.router.post('/stream-upload', async (ctx) => {
      // Force small limit of 5000 bytes for this test
      const body = await (ctx as any).readRawBodyBuffer(5000);
      ctx.json({ size: body.length });
    });

    const server = http.createServer((req, res) => app.handle(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as any).port;

    try {
      const responseStatus = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/stream-upload',
            method: 'POST',
            headers: {
              'Transfer-Encoding': 'chunked',
              'Content-Type': 'application/octet-stream',
            },
          },
          (res) => {
            res.resume(); // consume response body
            resolve(res.statusCode || 0);
          }
        );

        req.on('error', (err) => reject(err));

        // Write chunks totaling 15,000 bytes (exceeding 5,000 bytes limit)
        const chunk = Buffer.alloc(3000, 'x');
        req.write(chunk);
        req.write(chunk);
        req.write(chunk);
        req.write(chunk);
        req.write(chunk);
        req.end();
      });

      assert.strictEqual(responseStatus, 413, 'Client must receive HTTP 413 Payload Too Large');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
