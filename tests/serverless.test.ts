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
});
