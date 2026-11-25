import { AsyncLocalStorage } from 'node:async_hooks';
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
  private readonly connectionScope = new AsyncLocalStorage<{ connection: any; active: boolean }>();
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
      if (this.client) return;
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
   * Translates standard '?' parameter placeholders to PostgreSQL '$1, $2, ...' (ignoring '?' inside quotes)
   */
  public translateSql(sql: string): string {
    let index = 1;
    let out = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;

    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i]!;
      const prev = i > 0 ? sql[i - 1] : '';

      if (ch === "'" && !inDoubleQuote && !inBacktick && prev !== '\\') {
        inSingleQuote = !inSingleQuote;
        out += ch;
      } else if (ch === '"' && !inSingleQuote && !inBacktick && prev !== '\\') {
        inDoubleQuote = !inDoubleQuote;
        out += ch;
      } else if (ch === '`' && !inSingleQuote && !inDoubleQuote) {
        inBacktick = !inBacktick;
        out += '"';
      } else if (ch === '?' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
        out += `$${index++}`;
      } else {
        out += ch;
      }
    }

    return out;
  }

  public async withConnection<T>(callback: () => Promise<T>): Promise<T> {
    await this.connect();
    const connection = await this.client.connect();
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
    return scope?.connection ?? this.client;
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.connect();
    const pgSql = this.translateSql(sql);
    const result = await this.executor.query(pgSql, params);
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
      pgSql = pgSql.replace(/;?\s*$/, '') + ' RETURNING id';
    }

    const result = await this.executor.query(pgSql, params);
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
    await this.executor.query(pgSql);
  }

  public async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}
