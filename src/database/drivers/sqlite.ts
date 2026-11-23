import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { DatabaseDriver, DatabaseDialect, QueryResult } from './driver.js';

export interface SqliteConfig {
  database?: string;
}

export class SqliteDriver implements DatabaseDriver {
  public readonly dialect: DatabaseDialect = 'sqlite';
  private db: DatabaseSync | null = null;
  private databasePath: string;

  constructor(config: SqliteConfig = {}) {
    this.databasePath = config.database || process.env.DB_DATABASE || 'database/database.sqlite';
  }

  public connect(): void {
    if (this.db) return;

    if (this.databasePath !== ':memory:') {
      const fullPath = resolve(process.cwd(), this.databasePath);
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.db = new DatabaseSync(fullPath);
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec('PRAGMA journal_mode = WAL;');
    } else {
      this.db = new DatabaseSync(':memory:');
      this.db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  private getDb(): DatabaseSync {
    if (!this.db) {
      this.connect();
    }
    return this.db!;
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.getDb().prepare(sql);
    return stmt.all(...params) as T[];
  }

  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const stmt = this.getDb().prepare(sql);
    const row = stmt.get(...params);
    return (row as T) || null;
  }

  public async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    const stmt = this.getDb().prepare(sql);
    const info = stmt.run(...params);
    return {
      changes: info.changes,
      lastInsertRowid: info.lastInsertRowid,
    };
  }

  public async exec(sql: string): Promise<void> {
    this.getDb().exec(sql);
  }

  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
