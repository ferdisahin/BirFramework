import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { Application, createTestClient, type TestClient } from '../src/index.js';

describe('BirFramework HTTP Testing Assistant Tests', () => {
  let client: TestClient;

  after(async () => {
    if (client) {
      await client.close();
    }
  });

  test('createTestClient performs GET, POST, JSON assertions and redirects', async () => {
    const app = new Application();

    app.router.get('/api/ping', (ctx) => {
      ctx.json({ pong: true, message: 'BirFramework Rocks' });
    });

    app.router.post('/api/users', async (ctx) => {
      const body = await ctx.body();
      if (!body.name) {
        return ctx.json({ error: 'Name is required' }, 422);
      }
      return ctx.json({ id: 1, name: body.name }, 201);
    });

    app.router.get('/old-path', (ctx) => {
      ctx.res.writeHead(302, { Location: '/new-path' });
      ctx.res.end();
    });

    client = createTestClient(app);

    // 1. GET & Assertions
    const resGet = await client.get('/api/ping');
    resGet.assertOk()
      .assertJson({ pong: true, message: 'BirFramework Rocks' })
      .assertSee('BirFramework Rocks')
      .assertDontSee('Laravel PHP');

    assert.strictEqual(resGet.json().pong, true);

    // 2. POST with body & 201 Created
    const resPost = await client.post('/api/users', { name: 'Taylor' });
    resPost.assertCreated()
      .assertJson({ id: 1, name: 'Taylor' });

    // 3. Validation error & 422 Unprocessable
    const resFail = await client.post('/api/users', {});
    resFail.assertUnprocessable()
      .assertJson({ error: 'Name is required' });

    // 4. Redirect assertion
    const resRedirect = await client.get('/old-path');
    resRedirect.assertRedirect('/new-path');

    // 5. 404 Not Found
    const res404 = await client.get('/does-not-exist');
    res404.assertNotFound();
  });
});
