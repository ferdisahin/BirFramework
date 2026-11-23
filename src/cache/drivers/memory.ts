import type { CacheDriver } from '../driver.js';

interface MemoryCacheItem {
  value: any;
  expiresAt: number | null;
}

export class MemoryStore implements CacheDriver {
  private storage = new Map<string, MemoryCacheItem>();
  private readonly maxItems: number = 50000;

  public sweepExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, item] of this.storage.entries()) {
      if (item.expiresAt !== null && now > item.expiresAt) {
        this.storage.delete(key);
        count++;
      }
    }
    return count;
  }

  public async get<T = any>(key: string): Promise<T | null> {
    const item = this.storage.get(key);
    if (!item) return null;

    if (item.expiresAt !== null && Date.now() > item.expiresAt) {
      this.storage.delete(key);
      return null;
    }

    return item.value as T;
  }

  public async put(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (this.storage.size >= this.maxItems && !this.storage.has(key)) {
      this.sweepExpired();
      if (this.storage.size >= this.maxItems) {
        const oldestKey = this.storage.keys().next().value;
        if (oldestKey) this.storage.delete(oldestKey);
      }
    }

    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    this.storage.set(key, { value, expiresAt });
  }

  public async has(key: string): Promise<boolean> {
    const val = await this.get(key);
    return val !== null;
  }

  public async forget(key: string): Promise<boolean> {
    return this.storage.delete(key);
  }

  public async flush(): Promise<void> {
    this.storage.clear();
  }

  public async pull<T = any>(key: string): Promise<T | null> {
    const value = await this.get<T>(key);
    if (value !== null) {
      await this.forget(key);
    }
    return value;
  }

  public async increment(key: string, amount: number = 1): Promise<number> {
    const current = (await this.get<number>(key)) || 0;
    const next = Number(current) + amount;
    const item = this.storage.get(key);
    const ttlSeconds = item?.expiresAt ? Math.max(1, Math.round((item.expiresAt - Date.now()) / 1000)) : undefined;
    await this.put(key, next, ttlSeconds);
    return next;
  }

  public async decrement(key: string, amount: number = 1): Promise<number> {
    return this.increment(key, -amount);
  }
}
