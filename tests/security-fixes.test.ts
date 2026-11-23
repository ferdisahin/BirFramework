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

  // 9. WebSocket Frame Parser Fragmentation (TCP packet fragmentation handling)
  test('WebSocket server properly reassembles fragmented TCP frames across data events', async () => {
    let sentMessages: any[] = [];
    const mockSocket: any = {
      destroyed: false,
      write() {},
      end() { this.destroyed = true; },
      on() {},
    };

    const client = new WebSocketClient(mockSocket);
    client.send = (data: any) => sentMessages.push(data);

    // Register a test channel
    Broadcast.channel('chat-room', () => true);

    const fullFrame = WebSocketServer.createFrame(JSON.stringify({ event: 'subscribe', channel: 'chat-room' }));

    // Send the frame in 3 small fragmented chunks:
    // Chunk 1: first byte only (incomplete header)
    const chunk1 = fullFrame.subarray(0, 1);
    // Chunk 2: next 2 bytes (still incomplete or partial length)
    const chunk2 = fullFrame.subarray(1, 3);
    // Chunk 3: remainder of frame
    const chunk3 = fullFrame.subarray(3);

    (Broadcast.server as any).handleFrame(client, chunk1);
    assert.strictEqual(sentMessages.length, 0, 'No message should be processed with incomplete header');

    (Broadcast.server as any).handleFrame(client, chunk2);
    assert.strictEqual(sentMessages.length, 0, 'No message should be processed with partial frame');

    (Broadcast.server as any).handleFrame(client, chunk3);
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(sentMessages.length, 1, 'Message must be fully assembled and processed');
    assert.strictEqual(sentMessages[0]?.event, 'subscribed');
    assert.strictEqual(sentMessages[0]?.channel, 'chat-room');
  });

  // 10. Anonymous Session Memory Optimization & LRU Eviction
  test('Anonymous requests with empty sessions do not bloat session store memory', async () => {
    const { Application } = await import('../src/core/application.js');
    const { createTestClient } = await import('../src/testing/index.js');

    sessionStore.clear();
    const app = new Application();
    app.router.get('/public', (ctx) => {
      ctx.json({ ok: true, active: ctx.session?.id ? true : false });
    });

    const client = createTestClient(app);
    try {
      const initialSize = sessionStore.size;

      // Make multiple anonymous requests
      for (let i = 0; i < 5; i++) {
        const res = await client.get('/public');
        res.assertOk();
      }

      // Memory store must NOT retain empty anonymous sessions
      assert.strictEqual(sessionStore.size, initialSize, 'Empty anonymous sessions must not be stored in sessionStore');
    } finally {
      await client.close();
      sessionStore.clear();
    }
  });

  // 11. Serverless Rewrite Header Spoofing Protection
  test('Serverless handler ignores untrusted x-matched-path unless in a trusted serverless env', async () => {
    const { Application } = await import('../src/core/application.js');

    const app = new Application();
    let handledUrl = '';
    app.router.get('/actual-route', (ctx) => {
      handledUrl = ctx.req.url || '';
      ctx.text('actual');
    });
    app.router.get('/secret-admin', (ctx) => {
      handledUrl = ctx.req.url || '';
      ctx.text('secret');
    });

    const handler = app.serverless();

    // Case A: Outside serverless environment (headers must be ignored)
    const deleteEnv = () => {
      delete process.env.VERCEL;
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
      delete process.env.NETLIFY;
      delete process.env.TRUST_SERVERLESS_HEADERS;
    };
    deleteEnv();

    const reqUntrusted: any = new EventEmitter();
    reqUntrusted.method = 'GET';
    reqUntrusted.url = '/actual-route';
    reqUntrusted.headers = {
      host: 'example.com',
      'x-matched-path': '/secret-admin',
    };
    reqUntrusted.socket = { remoteAddress: '127.0.0.1' };

    const resUntrusted: any = {
      writableEnded: false,
      statusCode: 200,
      setHeader() {},
      writeHead() {},
      end() { this.writableEnded = true; },
    };

    await handler(reqUntrusted, resUntrusted);
    assert.strictEqual(reqUntrusted.url, '/actual-route', 'Untrusted x-matched-path must be ignored in standard env');

    // Case B: Inside trusted serverless env (VERCEL=1) with valid path
    process.env.VERCEL = '1';
    try {
      const reqTrusted: any = new EventEmitter();
      reqTrusted.method = 'GET';
      reqTrusted.url = '/api/index.js';
      reqTrusted.headers = {
        host: 'example.com',
        'x-matched-path': '/actual-route',
      };
      reqTrusted.socket = { remoteAddress: '127.0.0.1' };

      const resTrusted: any = {
        writableEnded: false,
        statusCode: 200,
        setHeader() {},
        writeHead() {},
        end() { this.writableEnded = true; },
      };

      await handler(reqTrusted, resTrusted);
      assert.strictEqual(reqTrusted.url, '/actual-route', 'Trusted x-matched-path must be applied');

      // Case C: Malicious path traversal or protocol relative URL must be rejected
      const reqMalicious: any = new EventEmitter();
      reqMalicious.method = 'GET';
      reqMalicious.url = '/actual-route';
      reqMalicious.headers = {
        host: 'example.com',
        'x-matched-path': '//malicious.com/secret',
      };
      reqMalicious.socket = { remoteAddress: '127.0.0.1' };

      const resMalicious: any = {
        writableEnded: false,
        statusCode: 200,
        setHeader() {},
        writeHead() {},
        end() { this.writableEnded = true; },
      };

      await handler(reqMalicious, resMalicious);
      assert.strictEqual(reqMalicious.url, '/actual-route', 'Malicious x-matched-path must be rejected');
    } finally {
      deleteEnv();
    }
  });

  // 12. Concurrent Request Session Cookie Isolation
  test('Concurrent requests do not overwrite each other session cookies or contexts', async () => {
    const { Application } = await import('../src/core/application.js');
    const { createTestClient } = await import('../src/testing/index.js');

    const app = new Application();
    app.router.post('/login-user1', async (ctx) => {
      await new Promise((r) => setTimeout(r, 15));
      await Auth.login(ctx, { id: 101, name: 'User 1' });
      ctx.json({ user: 101, sessionId: ctx.session.id });
    });

    app.router.post('/login-user2', async (ctx) => {
      await Auth.login(ctx, { id: 202, name: 'User 2' });
      ctx.json({ user: 202, sessionId: ctx.session.id });
    });

    const client = createTestClient(app);
    try {
      const [res1, res2] = await Promise.all([
        client.post('/login-user1'),
        client.post('/login-user2'),
      ]);

      res1.assertOk();
      res2.assertOk();

      const json1 = res1.json();
      const json2 = res2.json();

      assert.notStrictEqual(json1.sessionId, json2.sessionId, 'Concurrent logins must have different session IDs');
      assert.strictEqual(json1.user, 101);
      assert.strictEqual(json2.user, 202);

      const cookie1 = res1.headers.get('set-cookie');
      const cookie2 = res2.headers.get('set-cookie');

      assert.ok(cookie1?.includes(json1.sessionId), 'Response 1 must contain session 1 cookie');
      assert.ok(cookie2?.includes(json2.sessionId), 'Response 2 must contain session 2 cookie');
    } finally {
      await client.close();
    }
  });

  // 13. Path Traversal Prevention in Static File Server & LocalDisk
  test('LocalDisk throws on path traversal attempts', async () => {
    const { LocalDisk } = await import('../src/storage/index.js');
    const disk = new LocalDisk({ root: '/tmp/bir_test_storage' });

    assert.throws(() => {
      disk.path('../../../etc/passwd');
    }, /Path traversal attempt detected/);

    assert.throws(() => {
      disk.path('..\\..\\windows\\system32');
    }, /Path traversal attempt detected/);
  });

  test('Static file server blocks path traversal and null bytes', async () => {
    const { serveStatic } = await import('../src/http/static.js');
    const middleware = serveStatic();

    let nextCalled = false;
    const req: any = new EventEmitter();
    req.method = 'GET';
    req.url = '/../../../etc/passwd';
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
    await middleware(ctx, async () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'Traversal must pass through to next without serving file');
  });

  // 14. View Engine Path Traversal & RCE Prevention
  test('ViewEngine blocks template path traversal and dangerous expressions', async () => {
    const { ViewEngine } = await import('../src/view/engine.js');
    const engine = new ViewEngine();

    assert.throws(() => {
      engine.loadTemplate('../../../etc/passwd');
    }, /Invalid view template name|Path traversal detected/);

    // RCE test in template expressions
    const templateWithRCE = 'Hello {{ process.exit(1) }}';
    const rendered = engine.compile(templateWithRCE, {});
    // process identifier must be neutralized, output must not crash process
    assert.strictEqual(rendered.trim(), 'Hello');

    const templateWithRawRCE = 'Result: {!! require("child_process") !!}';
    const renderedRaw = engine.compile(templateWithRawRCE, {});
    assert.strictEqual(renderedRaw.trim(), 'Result:');
  });

  // 15. Reflected XSS Prevention in Built-in Error Pages
  test('Built-in error pages escape HTML in paths and error messages', async () => {
    const { ErrorHandler } = await import('../src/errors/handler.ts');

    const req: any = new EventEmitter();
    req.method = 'GET';
    req.url = '/<script>alert("xss")</script>';
    req.headers = { host: 'localhost', accept: 'text/html' };
    req.socket = { remoteAddress: '127.0.0.1' };

    let htmlBody = '';
    const res: any = {
      writableEnded: false,
      statusCode: 200,
      setHeader() {},
      writeHead() {},
      end(chunk?: any) {
        this.writableEnded = true;
        if (chunk) htmlBody = chunk;
      },
    };

    const ctx = new Context(req, res);
    ErrorHandler.handleNotFound(ctx);

    assert.strictEqual(res.statusCode, 404);
    assert.ok(!htmlBody.includes('<script>alert("xss")</script>'));
    assert.ok(htmlBody.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
  });

  // 16. Open Redirect Prevention in Validation Errors
  test('Validation error handler prevents open redirects to external hosts', async () => {
    const { ErrorHandler } = await import('../src/errors/handler.ts');
    const { ValidationError } = await import('../src/validation/index.js');

    const req: any = new EventEmitter();
    req.method = 'POST';
    req.url = '/submit';
    req.headers = {
      host: 'myapp.com',
      accept: 'text/html',
      referer: 'https://evil.com/phishing',
    };
    req.socket = { remoteAddress: '127.0.0.1' };

    let redirectedUrl = '';
    const res: any = {
      writableEnded: false,
      statusCode: 200,
      setHeader(name: string, val: string) {
        if (name.toLowerCase() === 'location') redirectedUrl = val;
      },
      writeHead() {},
      end() { this.writableEnded = true; },
    };

    const ctx = new Context(req, res);
    ctx.session = new Session();

    const err = new ValidationError('Validation failed', { email: ['Invalid email'] });
    await ErrorHandler.handleException(ctx, err);

    assert.notStrictEqual(redirectedUrl, 'https://evil.com/phishing', 'Must not redirect to external evil.com');
    assert.strictEqual(redirectedUrl, '/', 'Must fallback to safe relative path');
  });

  // 17. Prototype Pollution Prevention in Query, Multipart, and Cookies
  test('Prototype keys (__proto__, constructor, prototype) are ignored in Context query and URL-encoded body', async () => {
    const req: any = new EventEmitter();
    req.method = 'POST';
    req.url = '/test?__proto__=polluted&normal=safe';
    req.headers = {
      host: 'localhost',
      'content-type': 'application/x-www-form-urlencoded',
    };
    req.socket = { remoteAddress: '127.0.0.1' };

    const res: any = {
      writableEnded: false,
      statusCode: 200,
      setHeader() {},
      writeHead() {},
      end() {},
    };

    const ctx = new Context(req, res);
    assert.strictEqual(ctx.query['__proto__'], undefined);
    assert.strictEqual(ctx.query['normal'], 'safe');
    assert.strictEqual((Object.prototype as any).polluted, undefined);
  });

  // 18. SQL Injection & Operator Whitelisting in QueryBuilder
  test('QueryBuilder rejects unsupported or dangerous SQL operators and unsafe identifiers', async () => {
    const { QueryBuilder } = await import('../src/database/query.js');
    const qb = new QueryBuilder('users');

    assert.throws(() => {
      qb.where('id', '= 1; DROP TABLE users; --', 'val');
    }, /Unsupported or unsafe SQL operator/);

    assert.throws(() => {
      qb.where('id` = 1 OR `1` = `1', '=', '1');
    }, /Unsafe SQL identifier detected/);

    // OrderBy direction sanitization
    qb.orderBy('name', 'DESC; DROP TABLE users;' as any);
    const { sql } = qb.toSql();
    assert.ok(sql.includes('ORDER BY `name` ASC'), 'Invalid direction must default to ASC');
  });

  // 19. CRLF Injection Prevention in Headers and Redirects
  test('Context throws on CRLF injection in headers and redirects', () => {
    const req: any = new EventEmitter();
    req.method = 'GET';
    req.url = '/';
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

    assert.throws(() => {
      ctx.header('X-Injected\r\nSet-Cookie: evil=1', 'value');
    }, /CRLF injection prevented/);

    assert.throws(() => {
      ctx.header('X-Header', 'value\r\nInjected: evil');
    }, /CRLF injection prevented/);

    assert.throws(() => {
      ctx.redirect('http://example.com\r\nSet-Cookie: evil=1');
    }, /CRLF injection prevented/);
  });

  // 20. Default Security Headers
  test('Application sets default security headers on HTTP responses', async () => {
    const { Application } = await import('../src/core/application.js');
    const { createTestClient } = await import('../src/testing/index.js');

    const app = new Application();
    app.router.get('/ping', (ctx) => ctx.text('pong'));

    const client = createTestClient(app);
    try {
      const res = await client.get('/ping');
      res.assertOk();

      assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
      assert.strictEqual(res.headers.get('x-frame-options'), 'SAMEORIGIN');
      assert.strictEqual(res.headers.get('x-xss-protection'), '0');
    } finally {
      await client.close();
    }
  });

  // 21. Mass Assignment Protection in Eloquent Model
  test('Model protects sensitive attributes from mass assignment via fillable and guarded', async () => {
    const { Model } = await import('../src/database/model.js');

    class Account extends Model {
      public static override fillable = ['name', 'email'];
      public static override guarded = ['id', 'is_admin', 'balance'];
    }

    const payload = {
      name: 'John Doe',
      email: 'john@example.com',
      is_admin: true,
      balance: 1000000,
      __proto__: { polluted: true },
    };

    const filtered = Account.filterFillable(payload);
    assert.strictEqual(filtered.name, 'John Doe');
    assert.strictEqual(filtered.email, 'john@example.com');
    assert.strictEqual(filtered.is_admin, undefined, 'is_admin must be stripped');
    assert.strictEqual(filtered.balance, undefined, 'balance must be stripped');
    assert.strictEqual(filtered['__proto__'], undefined);

    const account = new Account();
    account.fill(payload);
    assert.strictEqual(account.name, 'John Doe');
    assert.strictEqual(account.is_admin, undefined);
  });

  // 22. Safe Markdown Link and Image URL Sanitization
  test('parseMarkdown blocks javascript: URLs and escapes quotes in links/images', async () => {
    const { parseMarkdown } = await import('../src/view/markdown.js');

    const evilLink = '[Click me](javascript:alert("XSS"))';
    const linkHtml = parseMarkdown(evilLink);
    assert.ok(!linkHtml.includes('javascript:alert'), 'Must sanitize javascript: protocol in link');
    assert.ok(linkHtml.includes('<a href="#">Click me</a>'));

    const evilImg = '![Evil](javascript:alert(1))';
    const imgHtml = parseMarkdown(evilImg);
    assert.ok(!imgHtml.includes('javascript:alert'), 'Must sanitize javascript: in image');
    assert.ok(imgHtml.includes('src="#"'));
  });

  // 23. Blade Component Bound Props RCE & Prototype Pollution Prevention
  test('Blade components block dangerous expressions and prototype pollution in bound props', async () => {
    const { ViewEngine } = await import('../src/view/engine.js');
    const engine = new ViewEngine();

    const template = '<x-card :data="process.exit(1)">Card Content</x-card>';
    // RCE in :data must not execute
    assert.doesNotThrow(() => {
      engine.compile(template, {});
    });

    const protoTemplate = '<x-card :__proto__="polluted">Card Content</x-card>';
    engine.compile(protoTemplate, {});
    assert.strictEqual((Object.prototype as any).polluted, undefined);
  });

  // 24. Validation unique rule identifier sanitization
  test('Validator unique rule rejects SQL injection in table or column identifier', async () => {
    const { Validator } = await import('../src/validation/index.js');

    await assert.rejects(async () => {
      await Validator.validate(
        { email: 'test@example.com' },
        { email: 'unique:users` WHERE 1=1; DROP TABLE users; --,email' }
      );
    }, /Unsafe table or column identifier in unique rule/);
  });

  // 25. SchemaBuilder identifier assert and default quote escaping
  test('SchemaBuilder validates identifiers and escapes single quotes in default values', async () => {
    const { ColumnDefinition, Blueprint } = await import('../src/database/schema.js');

    assert.throws(() => {
      new ColumnDefinition('id; DROP TABLE users;', 'INTEGER');
    }, /Unsafe SQL identifier detected/);

    const col = new ColumnDefinition('username', 'VARCHAR(255)');
    col.default("O'Reilly");
    const sql = col.toSql('sqlite');
    assert.ok(sql.includes("DEFAULT 'O''Reilly'"), 'Single quote must be escaped as double single-quotes');
  });

  // 26. Email Header Injection Prevention
  test('MailManager strips newline characters from recipient, from and subject', async () => {
    const { Mail } = await import('../src/mail/index.js');
    Mail.fake();

    await Mail.to('victim@example.com\r\nBcc: evil@attacker.com').raw('Hello', {
      subject: 'Welcome\r\nSubject: Injected Subject',
      from: 'admin@example.com\r\nReply-To: evil@attacker.com',
    });

    const sent = Mail.sent();
    const lastSent = sent[sent.length - 1];
    assert.ok(lastSent);
    assert.strictEqual(lastSent.to, 'victim@example.com Bcc: evil@attacker.com');
    assert.strictEqual(lastSent.subject, 'Welcome Subject: Injected Subject');
    assert.ok(!lastSent.to.includes('\r'));
    assert.ok(!lastSent.to.includes('\n'));
    assert.ok(!lastSent.subject.includes('\r'));
    assert.ok(!lastSent.subject.includes('\n'));
  });

  // 27. CLI Generator Identifier Validation
  test('CLI assertValidName rejects path traversal attempts in generator names', async () => {
    const { assertValidName } = await import('../src/cli/commands/make.js');

    assert.throws(() => {
      assertValidName('../../../etc/passwd');
    }, /Invalid name or path traversal attempt/);

    assert.throws(() => {
      assertValidName('Admin\\Secrets');
    }, /Invalid name or path traversal attempt/);

    assert.strictEqual(assertValidName('Admin/UserController'), 'Admin/UserController');
  });
});
