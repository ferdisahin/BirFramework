import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Application } from '../src/core/application.js';
import { ServiceProvider } from '../src/core/provider.js';

describe('BirFramework Service Provider & Plugin Architecture Tests', () => {
  test('ServiceProvider registers bindings into container and boots services', async () => {
    const app = new Application();
    let registerCalled = false;
    let bootCalled = false;

    class TestService {
      public greet() {
        return 'Hello from TestService';
      }
    }

    class TestServiceProvider extends ServiceProvider {
      public register(): void {
        registerCalled = true;
        this.app.container.singleton(TestService, () => new TestService());
      }

      public async boot(): Promise<void> {
        bootCalled = true;
        this.app.router.get('/test-provider-route', (ctx) => {
          const service = this.app.container.make(TestService);
          return ctx.json({ message: service.greet() });
        });
      }
    }

    // 1. Register provider
    app.register(TestServiceProvider);

    assert.strictEqual(registerCalled, true, 'register() must be called immediately');
    assert.strictEqual(bootCalled, false, 'boot() must NOT be called before app.boot()');
    assert.strictEqual(app.booted, false);

    // 2. Boot application
    await app.boot();

    assert.strictEqual(bootCalled, true, 'boot() must be called after app.boot()');
    assert.strictEqual(app.booted, true);

    // 3. Verify getProvider
    const retrieved = app.getProvider(TestServiceProvider);
    assert.ok(retrieved instanceof TestServiceProvider);

    // 4. Test route registered during boot
    const client = app.serverless();
    const req: any = {
      url: '/test-provider-route',
      method: 'GET',
      headers: { host: 'localhost' },
      on() {},
    };
    let responseBody = '';
    const res: any = {
      statusCode: 200,
      setHeader() {},
      getHeader() {},
      writeHead() {},
      write(chunk: any) { responseBody += chunk; },
      end(chunk?: any) { if (chunk) responseBody += chunk; },
    };

    await client(req, res);
    const parsed = JSON.parse(responseBody);
    assert.strictEqual(parsed.message, 'Hello from TestService');
  });

  test('Functional plugins can be registered with options', async () => {
    const app = new Application();
    let pluginOptionsReceived: any = null;

    const myPlugin = (targetApp: Application, options: any) => {
      pluginOptionsReceived = options;
      targetApp.router.get('/plugin-endpoint', (ctx) => {
        return ctx.json({ plugin: options.pluginName });
      });
    };

    app.register(myPlugin, { pluginName: 'analytics-plugin' });

    assert.deepStrictEqual(pluginOptionsReceived, { pluginName: 'analytics-plugin' });

    const client = app.serverless();
    const req: any = {
      url: '/plugin-endpoint',
      method: 'GET',
      headers: { host: 'localhost' },
      on() {},
    };
    let responseBody = '';
    const res: any = {
      statusCode: 200,
      setHeader() {},
      getHeader() {},
      writeHead() {},
      write(chunk: any) { responseBody += chunk; },
      end(chunk?: any) { if (chunk) responseBody += chunk; },
    };

    await client(req, res);
    const parsed = JSON.parse(responseBody);
    assert.strictEqual(parsed.plugin, 'analytics-plugin');
  });

  test('Registering provider on an already booted application boots it immediately', async () => {
    const app = new Application();
    await app.boot();
    assert.strictEqual(app.booted, true);

    let lateBootCalled = false;

    class LateServiceProvider extends ServiceProvider {
      public boot(): void {
        lateBootCalled = true;
      }
    }

    app.register(LateServiceProvider);
    assert.strictEqual(lateBootCalled, true, 'Provider registered after boot must be booted immediately');
  });

  test('app.handle() automatically triggers boot if not already booted', async () => {
    const app = new Application();
    let autoBooted = false;

    class AutoBootServiceProvider extends ServiceProvider {
      public boot(): void {
        autoBooted = true;
      }
    }

    app.register(AutoBootServiceProvider);
    assert.strictEqual(autoBooted, false);

    const client = app.serverless();
    const req: any = {
      url: '/any-path',
      method: 'GET',
      headers: { host: 'localhost' },
      on() {},
    };
    const res: any = {
      statusCode: 200,
      setHeader() {},
      getHeader() {},
      writeHead() {},
      write() {},
      end() {},
    };

    await client(req, res);
    assert.strictEqual(autoBooted, true, 'app.handle() must boot application on first dispatch');
    assert.strictEqual(app.booted, true);
  });
});
