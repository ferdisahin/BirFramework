import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { S3Disk, type S3DiskOptions } from './drivers/s3.js';

export * from './drivers/s3.js';

export interface StorageDisk {
  put(path: string, content: string | Buffer): Promise<boolean>;
  get(path: string): Promise<string | null>;
  getBuffer(path: string): Promise<Buffer | null>;
  delete(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  url(path: string): string;
  path(path: string): string;
  temporaryUrl?(path: string, expiresInSeconds?: number): string | Promise<string>;
}

export class LocalDisk implements StorageDisk {
  private rootDir: string;
  private publicUrlBase: string;

  constructor(options: { root?: string; publicUrlBase?: string } = {}) {
    this.rootDir = resolve(options.root || resolve(process.cwd(), 'storage/app'));
    this.publicUrlBase = options.publicUrlBase || '/storage';
  }

  public path(filePath: string): string {
    if (typeof filePath !== 'string' || filePath.includes('\0')) {
      throw new Error('[BirStorage] Invalid storage file path.');
    }
    const clean = filePath.replace(/^[/\\]+/, '');
    const resolved = resolve(this.rootDir, clean);
    const rel = relative(this.rootDir, resolved);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`[BirStorage] Path traversal attempt detected: "${filePath}".`);
    }
    return resolved;
  }

  public async put(filePath: string, content: string | Buffer): Promise<boolean> {
    const fullPath = this.path(filePath);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, content);
    return true;
  }

  public async get(filePath: string): Promise<string | null> {
    const fullPath = this.path(filePath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath, 'utf-8');
  }

  public async getBuffer(filePath: string): Promise<Buffer | null> {
    const fullPath = this.path(filePath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath);
  }

  public async delete(filePath: string): Promise<boolean> {
    const fullPath = this.path(filePath);
    if (!existsSync(fullPath)) return false;
    unlinkSync(fullPath);
    return true;
  }

  public async exists(filePath: string): Promise<boolean> {
    return existsSync(this.path(filePath));
  }

  public async size(filePath: string): Promise<number> {
    const fullPath = this.path(filePath);
    if (!existsSync(fullPath)) return 0;
    const stat = statSync(fullPath);
    return stat.size;
  }

  public url(filePath: string): string {
    const cleanPath = filePath.replace(/^\/+/, '');
    return `${this.publicUrlBase}/${cleanPath}`;
  }
}

export class StorageManager {
  private disks = new Map<string, StorageDisk>();
  private defaultDiskName: string = 'local';

  constructor() {
    // Default local disk
    this.disks.set('local', new LocalDisk({ root: resolve(process.cwd(), 'storage/app') }));
    // Public disk (accessible from web)
    this.disks.set('public', new LocalDisk({
      root: resolve(process.cwd(), 'public/storage'),
      publicUrlBase: '/storage',
    }));
  }

  public disk(name?: string): StorageDisk {
    const diskName = name || this.defaultDiskName;

    // Auto-initialize s3 disk if requested
    if (diskName === 's3' && !this.disks.has('s3')) {
      const bucket = process.env.AWS_BUCKET || process.env.S3_BUCKET || 'default';
      this.disks.set('s3', new S3Disk({
        bucket,
        region: process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
        endpoint: process.env.AWS_ENDPOINT || process.env.S3_ENDPOINT,
        key: process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID,
        secret: process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY,
        url: process.env.AWS_URL || process.env.S3_URL,
        forcePathStyle: process.env.AWS_USE_PATH_STYLE_ENDPOINT === 'true',
      }));
    }

    const disk = this.disks.get(diskName);
    if (!disk) {
      throw new Error(`[BirStorage] Storage disk [${diskName}] is not configured.`);
    }
    return disk;
  }

  public setDisk(name: string, disk: StorageDisk): this {
    this.disks.set(name, disk);
    return this;
  }

  public async put(path: string, content: string | Buffer): Promise<boolean> {
    return this.disk().put(path, content);
  }

  public async get(path: string): Promise<string | null> {
    return this.disk().get(path);
  }

  public async getBuffer(path: string): Promise<Buffer | null> {
    return this.disk().getBuffer(path);
  }

  public async delete(path: string): Promise<boolean> {
    return this.disk().delete(path);
  }

  public async exists(path: string): Promise<boolean> {
    return this.disk().exists(path);
  }

  public url(path: string): string {
    return this.disk('public').url(path);
  }
}

export const Storage = new StorageManager();
