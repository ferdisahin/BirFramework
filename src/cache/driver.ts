export interface CacheDriver {
  /**
   * Retrieve an item from the cache.
   */
  get<T = any>(key: string): Promise<T | null>;

  /**
   * Store an item in the cache with an optional TTL in seconds.
   * If ttlSeconds is omitted or 0, the item is stored indefinitely.
   */
  put(key: string, value: any, ttlSeconds?: number): Promise<void>;

  /**
   * Determine if an item exists in the cache and has not expired.
   */
  has(key: string): Promise<boolean>;

  /**
   * Remove an item from the cache.
   */
  forget(key: string): Promise<boolean>;

  /**
   * Remove all items from the cache.
   */
  flush(): Promise<void>;

  /**
   * Retrieve an item from the cache and then delete it.
   */
  pull<T = any>(key: string): Promise<T | null>;

  /**
   * Increment the value of an item in the cache.
   */
  increment(key: string, amount?: number): Promise<number>;

  /**
   * Decrement the value of an item in the cache.
   */
  decrement(key: string, amount?: number): Promise<number>;
}
