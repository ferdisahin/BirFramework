import type { DatabaseDriver, DatabaseDialect, QueryResult } from './drivers/driver.js';
import { SqliteDriver } from './drivers/sqlite.js';
import { PostgresDriver } from './drivers/postgres.js';
import { MysqlDriver } from './drivers/mysql.js';

export interface DatabaseConfig {
  driver?: DatabaseDialect;
  database?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  url?: string;
}

export class DatabaseConnection {
  private driverInstance: DatabaseDriver | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig = {}) {
    this.config = config;
  }

  public getDriver(): DatabaseDriver {
    if (!this.driverInstance) {
      this.driverInstance = this.resolveDriver();
    }
    return this.driverInstance;
  }

  public get dialect(): DatabaseDialect {
    return this.getDriver().dialect;
  }

  public connect(): void {
    this.getDriver().connect();
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.getDriver().query<T>(sql, params);
  }

  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    return this.getDriver().queryOne<T>(sql, params);
  }

  public async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    return this.getDriver().execute(sql, params);
  }

  public async exec(sql: string): Promise<void> {
    return this.getDriver().exec(sql);
  }

  public async transaction<T>(callback: () => Promise<T>): Promise<T> {
    await this.exec('BEGIN TRANSACTION;');
    try {
      const result = await callback();
      await this.exec('COMMIT;');
      return result;
    } catch (err) {
      await this.exec('ROLLBACK;');
      throw err;
    }
  }

  public async close(): Promise<void> {
    if (this.driverInstance) {
      await this.driverInstance.close();
      this.driverInstance = null;
    }
  }

  private resolveDriver(): DatabaseDriver {
    const rawDriver = this.config.driver || process.env.DB_CONNECTION || 'sqlite';
    const driver = rawDriver.toLowerCase();

    if (driver === 'postgres' || driver === 'postgresql') {
      return new PostgresDriver(this.config);
    }

    if (driver === 'mysql') {
      return new MysqlDriver(this.config);
    }

    // Default to zero-config SQLite
    return new SqliteDriver(this.config);
  }
}

// Global default database connection
export const dbConnection = new DatabaseConnection();
