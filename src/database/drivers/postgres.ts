import type { DatabaseDriver, DatabaseDialect, QueryResult } from './driver.js';

export interface PostgresConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  url?: string;
}

export class PostgresDriver implements DatabaseDriver {
  public readonly dialect: DatabaseDialect = 'postgres';
  private client: any = null;
  private config: PostgresConfig;

  constructor(config: PostgresConfig = {}) {
    this.config = {
      host: config.host || process.env.DB_HOST || '127.0.0.1',
      port: config.port || Number(process.env.DB_PORT) || 5432,
      database: config.database || process.env.DB_DATABASE || 'bir_app',
      user: config.user || process.env.DB_USERNAME || 'postgres',
      password: config.password || process.env.DB_PASSWORD || '',
      url: config.url || process.env.DATABASE_URL,
      ...config,
    };
  }

  public async connect(): Promise<void> {
    if (this.client) return;

    try {
      // Dynamic import of pg or postgres client if installed
      const pgModule = await import('pg' as any).catch(() => null);
      if (pgModule && pgModule.Pool) {
        const Pool = pgModule.Pool;
        this.client = new Pool(
          this.config.url ? { connectionString: this.config.url } : this.config
        );
        return;
      }

      throw new Error(
        '[BirDatabase] PostgreSQL client not found. Please install pg: npm install pg @types/pg'
      );
    } catch (err: any) {
      throw new Error(`[BirDatabase] Failed to connect to PostgreSQL: ${err.message}`);
    }
  }

  /**
   * Translates standard '?' parameter placeholders to PostgreSQL '$1, $2, ...'
   */
  public translateSql(sql: string): string {
    let index = 1;
    // Replace ? with $1, $2, etc. (unless inside quotes)
    const convertedSql = sql.replace(/\?/g, () => `$${index++}`);
    // Replace backticks with double quotes for PostgreSQL identifiers
    return convertedSql.replace(/`([^`]+)`/g, '"$1"');
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.connect();
    const pgSql = this.translateSql(sql);
    const result = await this.client.query(pgSql, params);
    return result.rows as T[];
  }

  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] || null;
  }

  public async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    await this.connect();
    let pgSql = this.translateSql(sql);

    // If it's an INSERT statement without RETURNING, append RETURNING id
    if (/^\s*INSERT\s+INTO/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
      pgSql += ' RETURNING id';
    }

    const result = await this.client.query(pgSql, params);
    const lastId = result.rows && result.rows[0] ? result.rows[0].id : 0;

    return {
      changes: result.rowCount || 0,
      lastInsertRowid: lastId || 0,
      rows: result.rows,
    };
  }

  public async exec(sql: string): Promise<void> {
    await this.connect();
    const pgSql = this.translateSql(sql);
    await this.client.query(pgSql);
  }

  public async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}
