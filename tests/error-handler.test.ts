import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { Application } from '../src/core/application.js';
import { createTestClient, type TestClient } from '../src/testing/test-client.js';
import { StackParser } from '../src/errors/stack-parser.js';

describe('BirFramework ErrorHandler & Ignition Debug Screen Tests', () => {
  let app: Application;
  let client: TestClient;

  before(() => {
    app = new Application();

    // Route that throws a runtime error
    app.router.get('/throw-error', () => {
      const user: any = undefined;
      return user.name.toUpperCase();
    });

    // API route that throws
    app.router.get('/api/fail', () => {
      throw new Error('Database connection failed unexpectedly');
    });

    client = createTestClient(app);
  });

  after(async () => {
    await client?.close();
  });

  test('StackParser should extract app frames, file location and code lines', () => {
    const mockStack = `TypeError: Cannot read properties of undefined (reading 'name')
    at /Users/test/project/app/controllers/PostController.ts:42:15
    at async Router.runPipeline (/Users/test/project/node_modules/birframework/router.js:150:5)`;

    const frames = StackParser.parse(mockStack);
    assert.strictEqual(frames.length, 2);

    const appFrame = frames[0]!;
    assert.strictEqual(appFrame.line, 42);
    assert.strictEqual(appFrame.column, 15);
    assert.strictEqual(appFrame.isAppFrame, true);

    const vendorFrame = frames[1]!;
    assert.strictEqual(vendorFrame.isAppFrame, false);
  });

  test('Interactive Ignition Debug Screen should render on browser 500 error', async () => {
    const res = await client.get('/throw-error', {
      headers: { Accept: 'text/html' },
    });

    res.assertStatus(500)
       .assertSee('BirFramework')
       .assertSee('Ignition Debug Screen')
       .assertSee('TypeError')
       .assertSee('Cannot read properties of undefined')
       .assertSee('Stack Trace')
       .assertSee('Environment');
  });

  test('API 500 error should return detailed JSON in development', async () => {
    const res = await client.get('/api/fail', {
      headers: { Accept: 'application/json' },
    });

    res.assertStatus(500);
    const data = res.json();
    assert.strictEqual(data.error, 'Error');
    assert.strictEqual(data.message, 'Database connection failed unexpectedly');
    assert.ok(data.stack, 'Stack trace should be included in dev');
  });

  test('Smart 404 should render HTML page for browser requests', async () => {
    const res = await client.get('/non-existent-page', {
      headers: { Accept: 'text/html' },
    });

    res.assertNotFound()
       .assertSee('404')
       .assertSee('Page Not Found')
       .assertSee('Return to Homepage');
  });

  test('Smart 404 should return JSON for API requests', async () => {
    const res = await client.get('/api/unknown-endpoint', {
      headers: { Accept: 'application/json' },
    });

    res.assertNotFound();
    const data = res.json();
    assert.strictEqual(data.error, 'Not Found');
    assert.strictEqual(data.path, '/api/unknown-endpoint');
  });

  test('Production mode masks error details and does not leak stack trace', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const res = await client.get('/api/fail', {
        headers: { Accept: 'application/json' },
      });

      res.assertStatus(500);
      const data = res.json();
      assert.strictEqual(data.error, 'Internal Server Error');
      assert.strictEqual(data.message, 'Server Error');
      assert.strictEqual(data.stack, undefined);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});
