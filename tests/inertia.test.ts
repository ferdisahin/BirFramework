import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { Application } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';
import { Inertia } from '../src/inertia/index.js';

describe('Unified Full-Stack Inertia + SSR Bridge Tests', () => {
  afterEach(() => {
    Inertia.clearShared();
    Inertia.setSsrRenderer(null);
  });

  test('ctx.inertia returns HTML shell with serialized data-page and optional SSR markup on initial load', async () => {
    Inertia.share('appName', 'BirApp');
    Inertia.setSsrRenderer((component, props) => `<main><h1>${component}: ${props.greeting}</h1></main>`);

    const app = new Application();
    app.router.get('/feed', (ctx) => ctx.inertia('Feed', { greeting: 'Hello World' }));

    const client = createTestClient(app);
    try {
      const res = await client.get('/feed');
      res.assertOk()
         .assertSee('<div id="app" data-page=')
         .assertSee('<main><h1>Feed: Hello World</h1></main>')
         .assertSee('BirApp');
    } finally {
      await client.close();
    }
  });

  test('ctx.inertia returns JSON page object when X-Bir-Inertia: true header is sent', async () => {
    Inertia.share('auth', async () => ({ user: { id: 1, name: 'Ferdi' } }));

    const app = new Application();
    app.router.get('/feed', (ctx) => ctx.inertia('Feed', { count: 12 }));

    const client = createTestClient(app);
    try {
      const res = await client.get('/feed', {
        headers: { 'X-Bir-Inertia': 'true' },
      });

      res.assertOk()
         .assertHeader('x-bir-inertia', 'true');
      const data = res.json();
      assert.strictEqual(data.component, 'Feed');
      assert.strictEqual(data.url, '/feed');
      assert.strictEqual(data.props.count, 12);
      assert.strictEqual(data.props.auth.user.name, 'Ferdi');
    } finally {
      await client.close();
    }
  });

  test('Inertia.location sends 409 X-Bir-Inertia-Location for SPA requests and 302 for normal requests', async () => {
    const app = new Application();
    app.router.get('/go', (ctx) => Inertia.location(ctx, '/login'));

    const client = createTestClient(app);
    try {
      const spaRes = await client.get('/go', { headers: { 'X-Bir-Inertia': 'true' } });
      spaRes.assertStatus(409)
            .assertHeader('x-bir-inertia-location', '/login');

      const browserRes = await client.get('/go');
      browserRes.assertStatus(302)
                .assertHeader('location', '/login');
    } finally {
      await client.close();
    }
  });
});
