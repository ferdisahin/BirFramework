import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { CacheDriver } from '../driver.js';

interface FileCachePayload {
  expiresAt: number | null;
  value: any;
}

export class FileStore implements CacheDriver {
  private directory: string;

  constructor(directory?: string) {
    this.directory = directory ? resolve(directory) : resolve(process.cwd(), 'storage/cache');
    try {
      if (!existsSync(this.directory)) {
        mkdirSync(this.directory, { recursive: true });
      }
    } catch {
      // In read-only serverless environments (AWS Lambda / Vercel), fallback to /tmp
      try {
        const tmpDir = resolve('/tmp/storage/cache');
        if (!existsSync(tmpDir)) {
          mkdirSync(tmpDir, { recursive: true });
        }
        this.directory = tmpDir;
      } catch {
        // Ignore if unable to create tmp directory
      }
    }
  }

  private getFilePath(key: string): string {
    const hash = createHash('sha1').update(key).digest('hex');
    return join(this.directory, `${hash}.json`);
  }

  public async get<T = any>(key: string): Promise<T | null> {
    const file = this.getFilePath(key);
    if (!existsSync(file)) return null;

    try {
      const raw = readFileSync(file, 'utf-8');
      const data = JSON.parse(raw) as FileCachePayload;

      if (data.expiresAt !== null && Date.now() > data.expiresAt) {
        try { unlinkSync(file); } catch { /* ignore concurrent delete */ }
        return null;
      }

      return data.value as T;
    } catch {
      return null;
    }
  }

  public async put(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      if (!existsSync(this.directory)) {
        mkdirSync(this.directory, { recursive: true });
      }
    } catch {
      // Fallback to /tmp if read-only
      this.directory = resolve('/tmp/storage/cache');
      if (!existsSync(this.directory)) {
        try { mkdirSync(this.directory, { recursive: true }); } catch { /* ignore */ }
      }
    }

    const file = this.getFilePath(key);
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    const payload: FileCachePayload = { expiresAt, value };

    writeFileSync(file, JSON.stringify(payload), 'utf-8');
  }

  public async has(key: string): Promise<boolean> {
    const val = await this.get(key);
    return val !== null;
  }

  public async forget(key: string): Promise<boolean> {
    const file = this.getFilePath(key);
    if (existsSync(file)) {
      try {
        unlinkSync(file);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  public async flush(): Promise<void> {
    if (!existsSync(this.directory)) return;

    const files = readdirSync(this.directory);
    for (const f of files) {
      if (f.endsWith('.json')) {
        try {
          unlinkSync(join(this.directory, f));
        } catch {
          // ignore
        }
      }
    }
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
    
    // Read payload to preserve TTL
    const file = this.getFilePath(key);
    let ttlSeconds: number | undefined;
    if (existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, 'utf-8')) as FileCachePayload;
        if (data.expiresAt) {
          ttlSeconds = Math.max(1, Math.round((data.expiresAt - Date.now()) / 1000));
        }
      } catch {
        // ignore
      }
    }

    await this.put(key, next, ttlSeconds);
    return next;
  }

  public async decrement(key: string, amount: number = 1): Promise<number> {
    return this.increment(key, -amount);
  }
}
