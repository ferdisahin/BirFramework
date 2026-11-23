import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Application } from '../src/core/application.js';
import { EventEmitter } from 'node:events';

describe('BirFramework Serverless Adapter Tests', () => {
  test('app.serverless() should dispatch incoming HTTP request and handle response', async () => {
    const app = new Application();
    app.router.get('/hello', (ctx) => ctx.json({ message: 'Hello Serverless!' }));

    const handler = app.serverless();

    // Mock incoming request
    const req: any = new EventEmitter();
    req.method = 'GET';
    req.url = '/hello';
    req.headers = { host: 'example.com' };

    // Mock server response
    let statusCode = 200;
    const headers: Record<string, string> = {};
    let responseBody = '';

    const res: any = {
      writableEnded: false,
      statusCode: 200,
      setHeader(name: string, val: string) {
        headers[name.toLowerCase()] = val;
      },
      writeHead(code: number, hdrs?: any) {
        statusCode = code;
        if (hdrs) Object.assign(headers, hdrs);
      },
      end(chunk?: any) {
        this.writableEnded = true;
        if (chunk) responseBody += chunk;
      },
    };

    await handler(req, res);

    assert.strictEqual(statusCode, 200);
    assert.ok(headers['content-type'].includes('application/json'));
    const json = JSON.parse(responseBody);
    assert.strictEqual(json.message, 'Hello Serverless!');
  });

  test('app.serverless() should restore rewritten URL from x-matched-path header', async () => {
    const app = new Application();
    app.router.get('/docs/installation', (ctx) => ctx.json({ page: 'installation' }));

    const handler = app.serverless();

    const req: any = new EventEmitter();
    req.method = 'GET';
    req.url = '/api/index.js';
    req.headers = {
      host: 'birframework.dev',
      'x-matched-path': '/docs/installation',
    };

    let statusCode = 200;
    const headers: Record<string, string> = {};
    let responseBody = '';

    const res: any = {
      writableEnded: false,
      statusCode: 200,
      setHeader(name: string, val: string) {
        headers[name.toLowerCase()] = val;
      },
      writeHead(code: number, hdrs?: any) {
        statusCode = code;
        if (hdrs) Object.assign(headers, hdrs);
      },
      end(chunk?: any) {
        this.writableEnded = true;
        if (chunk) responseBody += chunk;
      },
    };

    await handler(req, res);

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(req.url, '/docs/installation');
    const json = JSON.parse(responseBody);
    assert.strictEqual(json.page, 'installation');
  });

  test('app.serverless() should mask stack trace and sensitive error details in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDebug = process.env.APP_DEBUG;
    process.env.NODE_ENV = 'production';
    delete process.env.APP_DEBUG;

    try {
      const app = new Application();
      app.router.get('/secret-crash', () => {
        throw new Error('Database password leak: secret12345');
      });

      const handler = app.serverless();

      const req: any = new EventEmitter();
      req.method = 'GET';
      req.url = '/secret-crash';
      req.headers = { host: 'example.com', accept: 'application/json' };

      let responseBody = '';
      const res: any = {
        writableEnded: false,
        statusCode: 200,
        setHeader() {},
        writeHead(code: number) {
          this.statusCode = code;
        },
        end(chunk?: any) {
          this.writableEnded = true;
          if (chunk) responseBody += chunk;
        },
      };

      await handler(req, res);

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(responseBody.includes('secret12345'), false);
      assert.strictEqual(responseBody.includes('Database password leak'), false);
      assert.strictEqual(responseBody.includes('stack'), false);
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalDebug !== undefined) {
        process.env.APP_DEBUG = originalDebug;
      } else {
        delete process.env.APP_DEBUG;
      }
    }
  });
});
