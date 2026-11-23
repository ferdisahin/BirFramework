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

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.connect();
    const [rows] = await this.pool.query(sql, params);
    return rows as T[];
  }

  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] || null;
  }

  public async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    await this.connect();
    const [result] = await this.pool.execute(sql, params);
    return {
      changes: result.affectedRows || 0,
      lastInsertRowid: result.insertId || 0,
    };
  }

  public async exec(sql: string): Promise<void> {
    await this.connect();
    await this.pool.query(sql);
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
