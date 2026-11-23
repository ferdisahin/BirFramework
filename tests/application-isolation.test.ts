import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Application } from '../src/core/application.js';

describe('BirFramework Application Instance Isolation Tests', () => {
  test('multiple Application instances have isolated routers and containers', () => {
    const app1 = new Application();
    const app2 = new Application();

    // 1. Verify separate router instances
    assert.notStrictEqual(app1.router, app2.router);

    // 2. Add route to app1 only
    app1.router.get('/only-on-app1', (ctx) => ctx.text('app1'));

    const app1Routes = app1.router.getRoutes().map((r) => r.path);
    const app2Routes = app2.router.getRoutes().map((r) => r.path);

    assert.ok(app1Routes.includes('/only-on-app1'));
    assert.strictEqual(app2Routes.includes('/only-on-app1'), false);

    // 3. Verify separate container instances
    assert.notStrictEqual(app1.container, app2.container);

    app1.container.bind('service', () => ({ name: 'service1' }));
    assert.strictEqual(app1.container.has('service'), true);
    assert.strictEqual(app2.container.has('service'), false);

    // 4. Verify each application registers itself in its own container
    assert.strictEqual(app1.container.make(Application), app1);
    assert.strictEqual(app2.container.make(Application), app2);
  });
});
