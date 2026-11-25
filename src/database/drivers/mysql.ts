import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseDriver, DatabaseDialect, QueryResult } from './driver.js';

export interface MysqlConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  url?: string;
}

export class MysqlDriver implements DatabaseDriver {
  public readonly dialect: DatabaseDialect = 'mysql';
  private pool: any = null;
  private readonly connectionScope = new AsyncLocalStorage<{ connection: any; active: boolean }>();
  private config: MysqlConfig;

  constructor(config: MysqlConfig = {}) {
    this.config = {
      host: config.host || process.env.DB_HOST || '127.0.0.1',
      port: config.port || Number(process.env.DB_PORT) || 3306,
      database: config.database || process.env.DB_DATABASE || 'bir_app',
      user: config.user || process.env.DB_USERNAME || 'root',
      password: config.password || process.env.DB_PASSWORD || '',
      url: config.url || process.env.DATABASE_URL,
      ...config,
    };
  }

  public async connect(): Promise<void> {
    if (this.pool) return;

    try {
      const mysqlModule = await import('mysql2/promise' as any).catch(() => null);
      if (this.pool) return;
      if (mysqlModule && mysqlModule.createPool) {
        this.pool = mysqlModule.createPool(
          this.config.url ? this.config.url : this.config
        );
        return;
      }

      throw new Error(
        '[BirDatabase] MySQL client not found. Please install mysql2: npm install mysql2'
      );
    } catch (err: any) {
      throw new Error(`[BirDatabase] Failed to connect to MySQL: ${err.message}`);
    }
  }

  public async withConnection<T>(callback: () => Promise<T>): Promise<T> {
    await this.connect();
    const connection = await this.pool.getConnection();
    const scope = { connection, active: true };
    try {
      return await this.connectionScope.run(scope, callback);
    } finally {
      scope.active = false;
      connection.release();
    }
  }

  private get executor(): any {
    const scope = this.connectionScope.getStore();
    if (scope && !scope.active) throw new Error('[BirDatabase] Transaction connection has already been released.');
    return scope?.connection ?? this.pool;
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.connect();
    const [rows] = await this.executor.query(sql, params);
    return rows as T[];
  }

  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] || null;
  }

  public async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    await this.connect();
    const [result] = await this.executor.execute(sql, params);
    return {
      changes: result.affectedRows || 0,
      lastInsertRowid: result.insertId || 0,
    };
  }

  public async exec(sql: string): Promise<void> {
    await this.connect();
    await this.executor.query(sql);
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
