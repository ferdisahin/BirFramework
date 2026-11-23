import type { CacheDriver } from './driver.js';
import { MemoryStore } from './drivers/memory.js';
import { FileStore } from './drivers/file.js';

export class CacheManager {
  private stores = new Map<string, CacheDriver>();
  private defaultStore: string = 'memory';

  constructor() {
    this.defaultStore = process.env.CACHE_STORE || process.env.CACHE_DRIVER || 'memory';
    this.stores.set('memory', new MemoryStore());
    this.stores.set('file', new FileStore());
  }

  /**
   * Get a cache store instance by name.
   */
  public store(name?: string): CacheDriver {
    const storeName = name || this.defaultStore;
    const store = this.stores.get(storeName);

    if (!store) {
      throw new Error(`[BirCache] Cache driver "${storeName}" is not registered.`);
    }

    return store;
  }

  /**
   * Register a custom cache driver.
   */
  public extend(name: string, driver: CacheDriver): this {
    this.stores.set(name, driver);
    return this;
  }

  /**
   * Set the default cache driver name.
   */
  public setDefaultStore(name: string): this {
    this.defaultStore = name;
    return this;
  }

  // Proxy convenience methods to default store
  public async get<T = any>(key: string, defaultValue?: T): Promise<T | null> {
    const val = await this.store().get<T>(key);
    if (val === null && defaultValue !== undefined) {
      return defaultValue;
    }
    return val;
  }

  public async put(key: string, value: any, ttlSeconds?: number): Promise<void> {
    return this.store().put(key, value, ttlSeconds);
  }

  public async has(key: string): Promise<boolean> {
    return this.store().has(key);
  }

  public async forget(key: string): Promise<boolean> {
    return this.store().forget(key);
  }

  public async flush(): Promise<void> {
    return this.store().flush();
  }

  public async pull<T = any>(key: string): Promise<T | null> {
    return this.store().pull<T>(key);
  }

  public async increment(key: string, amount: number = 1): Promise<number> {
    return this.store().increment(key, amount);
  }

  public async decrement(key: string, amount: number = 1): Promise<number> {
    return this.store().decrement(key, amount);
  }

  /**
   * Get an item from the cache, or execute the given callback and store the result.
   */
  public async remember<T = any>(
    key: string,
    ttlSeconds: number,
    callback: () => Promise<T> | T
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await callback();
    await this.put(key, value, ttlSeconds);
    return value;
  }

  /**
   * Get an item from the cache, or execute the given callback and store the result indefinitely.
   */
  public async rememberForever<T = any>(
    key: string,
    callback: () => Promise<T> | T
  ): Promise<T> {
    return this.remember(key, 0, callback);
  }
}

// Global default singleton manager
export const cache = new CacheManager();

// Static Facade
export class Cache {
  public static store(name?: string): CacheDriver {
    return cache.store(name);
  }

  public static extend(name: string, driver: CacheDriver): CacheManager {
    return cache.extend(name, driver);
  }

  public static setDefaultStore(name: string): CacheManager {
    return cache.setDefaultStore(name);
  }

  public static async get<T = any>(key: string, defaultValue?: T): Promise<T | null> {
    return cache.get<T>(key, defaultValue);
  }

  public static async put(key: string, value: any, ttlSeconds?: number): Promise<void> {
    return cache.put(key, value, ttlSeconds);
  }

  public static async has(key: string): Promise<boolean> {
    return cache.has(key);
  }

  public static async forget(key: string): Promise<boolean> {
    return cache.forget(key);
  }

  public static async flush(): Promise<void> {
    return cache.flush();
  }

  public static async pull<T = any>(key: string): Promise<T | null> {
    return cache.pull<T>(key);
  }

  public static async increment(key: string, amount?: number): Promise<number> {
    return cache.increment(key, amount);
  }

  public static async decrement(key: string, amount?: number): Promise<number> {
    return cache.decrement(key, amount);
  }

  public static async remember<T = any>(
    key: string,
    ttlSeconds: number,
    callback: () => Promise<T> | T
  ): Promise<T> {
    return cache.remember<T>(key, ttlSeconds, callback);
  }

  public static async rememberForever<T = any>(
    key: string,
    callback: () => Promise<T> | T
  ): Promise<T> {
    return cache.rememberForever<T>(key, callback);
  }
}
