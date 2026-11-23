import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { Cache, MemoryStore, FileStore } from '../src/cache/index.js';

describe('BirFramework Cache System Tests', () => {
  const testCacheDir = resolve(process.cwd(), 'storage/test-cache');

  afterEach(async () => {
    await Cache.flush();
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  describe('MemoryStore & Cache Facade', () => {
    test('put and get should store and retrieve values', async () => {
      await Cache.put('greeting', 'Hello World');
      const val = await Cache.get('greeting');
      assert.strictEqual(val, 'Hello World');
    });

    test('get with default value should return default when key not found', async () => {
      const val = await Cache.get('non_existent', 'default_val');
      assert.strictEqual(val, 'default_val');
    });

    test('has should return true for existing unexpired key', async () => {
      await Cache.put('status', 'active');
      assert.strictEqual(await Cache.has('status'), true);
      assert.strictEqual(await Cache.has('not_here'), false);
    });

    test('forget should remove key and return true', async () => {
      await Cache.put('temp', 123);
      assert.strictEqual(await Cache.has('temp'), true);
      const removed = await Cache.forget('temp');
      assert.strictEqual(removed, true);
      assert.strictEqual(await Cache.has('temp'), false);
    });

    test('flush should clear all cache keys', async () => {
      await Cache.put('key1', 'val1');
      await Cache.put('key2', 'val2');
      await Cache.flush();
      assert.strictEqual(await Cache.get('key1'), null);
      assert.strictEqual(await Cache.get('key2'), null);
    });

    test('pull should retrieve item and remove it from cache', async () => {
      await Cache.put('one_time_token', 'secret123');
      const token = await Cache.pull('one_time_token');
      assert.strictEqual(token, 'secret123');
      const again = await Cache.get('one_time_token');
      assert.strictEqual(again, null);
    });

    test('increment and decrement should adjust numerical values', async () => {
      await Cache.put('counter', 10);
      const inc = await Cache.increment('counter', 5);
      assert.strictEqual(inc, 15);
      assert.strictEqual(await Cache.get('counter'), 15);

      const dec = await Cache.decrement('counter', 3);
      assert.strictEqual(dec, 12);
      assert.strictEqual(await Cache.get('counter'), 12);
    });

    test('TTL expiration should invalidate cached values', async () => {
      // 1 second TTL
      await Cache.put('short_lived', 'fast', 1);
      assert.strictEqual(await Cache.get('short_lived'), 'fast');

      // Wait 1.1s for expiration
      await new Promise((r) => setTimeout(r, 1100));
      assert.strictEqual(await Cache.get('short_lived'), null);
    });

    test('remember should compute on miss and return cached value on subsequent calls', async () => {
      let callCount = 0;
      const expensiveCalculation = async () => {
        callCount++;
        return { data: 'computed_result', count: callCount };
      };

      // Call 1: Miss -> should execute callback
      const result1 = await Cache.remember('expensive_key', 60, expensiveCalculation);
      assert.strictEqual(result1.count, 1);
      assert.strictEqual(callCount, 1);

      // Call 2: Hit -> should return cached result without executing callback
      const result2 = await Cache.remember('expensive_key', 60, expensiveCalculation);
      assert.strictEqual(result2.count, 1);
      assert.strictEqual(callCount, 1); // Callback was NOT called again
    });
  });

  describe('FileStore Driver', () => {
    test('FileStore should persist data to disk and read back', async () => {
      const fileStore = new FileStore(testCacheDir);

      await fileStore.put('file_key', { name: 'BirFramework', version: '0.1.6' });
      const data = await fileStore.get<any>('file_key');

      assert.deepStrictEqual(data, { name: 'BirFramework', version: '0.1.6' });
      assert.strictEqual(await fileStore.has('file_key'), true);

      // Increment in FileStore
      await fileStore.put('views', 100);
      const newCount = await fileStore.increment('views', 10);
      assert.strictEqual(newCount, 110);
      assert.strictEqual(await fileStore.get('views'), 110);

      // Forget in FileStore
      const deleted = await fileStore.forget('file_key');
      assert.strictEqual(deleted, true);
      assert.strictEqual(await fileStore.get('file_key'), null);

      // Flush in FileStore
      await fileStore.flush();
      assert.strictEqual(await fileStore.get('views'), null);
    });

    test('FileStore should respect TTL expiration', async () => {
      const fileStore = new FileStore(testCacheDir);

      await fileStore.put('temp_file', 'expires_soon', 1);
      assert.strictEqual(await fileStore.get('temp_file'), 'expires_soon');

      await new Promise((r) => setTimeout(r, 1100));
      assert.strictEqual(await fileStore.get('temp_file'), null);
    });

    test('Cache.store("file") should allow multi-driver selection', async () => {
      const fileDriver = Cache.store('file');
      await fileDriver.put('driver_test', 'persisted');

      const memDriver = Cache.store('memory');
      assert.strictEqual(await memDriver.get('driver_test'), null); // Not in memory
      assert.strictEqual(await fileDriver.get('driver_test'), 'persisted'); // In file
    });
  });
});
