import type { CacheDriver } from '../driver.js';

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  url?: string;
  prefix?: string;
}

export class RedisStore implements CacheDriver {
  private client: any = null;
  private config: RedisConfig;
  private prefix: string;

  constructor(config: RedisConfig = {}) {
    this.config = {
      host: config.host || process.env.REDIS_HOST || '127.0.0.1',
      port: config.port || Number(process.env.REDIS_PORT) || 6379,
      password: config.password || process.env.REDIS_PASSWORD || undefined,
      db: config.db !== undefined ? config.db : Number(process.env.REDIS_DB) || 0,
      url: config.url || process.env.REDIS_URL,
      ...config,
    };
    this.prefix = config.prefix || process.env.CACHE_PREFIX || 'bir_cache:';
  }

  /**
   * Connect dynamically to ioredis if installed.
   * If mockClient or simulated environment, use it directly.
   */
  public async getClient(): Promise<any> {
    if (this.client) return this.client;

    try {
      const ioredis = await import('ioredis' as any).catch(() => null);
      if (ioredis) {
        const RedisConstructor = ioredis.default || ioredis.Redis || ioredis;
        this.client = this.config.url
          ? new RedisConstructor(this.config.url)
          : new RedisConstructor(this.config);
        return this.client;
      }
    } catch {
      // fallback
    }

    throw new Error(
      '[BirCache] Redis client not found. Please install ioredis: npm install ioredis @types/ioredis'
    );
  }

  public setMockClient(mock: any): void {
    this.client = mock;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  public async get<T = any>(key: string): Promise<T | null> {
    const client = await this.getClient();
    const val = await client.get(this.getKey(key));
    if (val === null || val === undefined) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  }

  public async put(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const client = await this.getClient();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const k = this.getKey(key);

    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(k, serialized, 'EX', ttlSeconds);
    } else {
      await client.set(k, serialized);
    }
  }

  public async has(key: string): Promise<boolean> {
    const client = await this.getClient();
    const exists = await client.exists(this.getKey(key));
    return exists === 1;
  }

  public async forget(key: string): Promise<boolean> {
    const client = await this.getClient();
    const deleted = await client.del(this.getKey(key));
    return deleted > 0;
  }

  public async flush(): Promise<void> {
    const client = await this.getClient();
    // Delete all keys matching prefix
    const keys = await client.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }

  public async pull<T = any>(key: string): Promise<T | null> {
    const val = await this.get<T>(key);
    if (val !== null) {
      await this.forget(key);
    }
    return val;
  }

  public async increment(key: string, amount: number = 1): Promise<number> {
    const client = await this.getClient();
    return client.incrby(this.getKey(key), amount);
  }

  public async decrement(key: string, amount: number = 1): Promise<number> {
    const client = await this.getClient();
    return client.decrby(this.getKey(key), amount);
  }
}
