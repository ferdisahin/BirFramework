import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Container } from '../src/container/container.js';

describe('BirFramework Container Tests', () => {
  test('should bind and make synchronous dependencies', () => {
    const container = new Container();
    container.bind('config', () => ({ env: 'test' }));

    const config = container.make<{ env: string }>('config');
    assert.strictEqual(config.env, 'test');
  });

  test('should throw error when calling make() on async factory returning a Promise', () => {
    const container = new Container();
    container.bindAsync('asyncService', async () => {
      return { loaded: true };
    });

    assert.throws(() => {
      container.make('asyncService');
    }, /Cannot synchronously resolve async binding/);
  });

  test('should throw error when make() receives unflagged factory returning Promise at runtime', () => {
    const container = new Container();
    // Force passing an async returning function as normal factory
    container.bind('sneakyAsync', (() => Promise.resolve('data')) as any);

    assert.throws(() => {
      container.make('sneakyAsync');
    }, /returned a Promise\. Use makeAsync\(\)/);
  });

  test('should resolve async factories with makeAsync()', async () => {
    const container = new Container();
    container.bindAsync('asyncData', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { value: 42 };
    });

    const result = await container.makeAsync<{ value: number }>('asyncData');
    assert.strictEqual(result.value, 42);
  });

  test('singletonAsync should cache resolved value for subsequent makeAsync calls', async () => {
    let callCount = 0;
    const container = new Container();
    container.singletonAsync('heavyService', async () => {
      callCount++;
      return { id: Math.random() };
    });

    const first = await container.makeAsync<{ id: number }>('heavyService');
    const second = await container.makeAsync<{ id: number }>('heavyService');

    assert.strictEqual(callCount, 1);
    assert.strictEqual(first.id, second.id);
  });
});
