import { AsyncLocalStorage } from 'node:async_hooks';
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
  private readonly transactionScope = new AsyncLocalStorage<{ active: boolean }>();
  private sqliteTransactions?: Promise<void>;
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
    let pending: Promise<void> | undefined;
    while ((pending = this.pendingSQLiteTransaction())) await pending;
    return this.getDriver().query<T>(sql, params);
  }

  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    let pending: Promise<void> | undefined;
    while ((pending = this.pendingSQLiteTransaction())) await pending;
    return this.getDriver().queryOne<T>(sql, params);
  }

  public async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    let pending: Promise<void> | undefined;
    while ((pending = this.pendingSQLiteTransaction())) await pending;
    return this.getDriver().execute(sql, params);
  }

  public async exec(sql: string): Promise<void> {
    let pending: Promise<void> | undefined;
    while ((pending = this.pendingSQLiteTransaction())) await pending;
    return this.getDriver().exec(sql);
  }

  private pendingSQLiteTransaction(): Promise<void> | undefined {
    const scope = this.transactionScope.getStore();
    if (scope && !scope.active) throw new Error('[BirDatabase] Transaction has already ended.');
    return scope ? undefined : this.sqliteTransactions;
  }

  public async transaction<T>(callback: () => Promise<T>): Promise<T> {
    if (this.transactionScope.getStore()) {
      throw new Error('[BirDatabase] Nested transactions are not supported.');
    }
    const driver = this.getDriver();
    const run = async () => {
      const scope = { active: true };
      try {
        return await this.transactionScope.run(scope, async () => {
          await driver.exec(driver.dialect === 'mysql' ? 'START TRANSACTION' : 'BEGIN TRANSACTION');
          try {
            const result = await callback();
            await driver.exec('COMMIT');
            return result;
          } catch (error) {
            try {
              await driver.exec('ROLLBACK');
            } catch (rollbackError) {
              throw new AggregateError([error, rollbackError], '[BirDatabase] Transaction and rollback failed.');
            }
            throw error;
          }
        });
      } finally {
        scope.active = false;
      }
    };

    if (driver.withConnection) return driver.withConnection(run);
    const previous = this.sqliteTransactions;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    this.sqliteTransactions = pending;
    await previous;
    try {
      return await run();
    } finally {
      if (this.sqliteTransactions === pending) this.sqliteTransactions = undefined;
      release();
    }
  }

  public async close(): Promise<void> {
    if (this.transactionScope.getStore()) throw new Error('[BirDatabase] Cannot close a connection inside a transaction.');
    let pending: Promise<void> | undefined;
    while ((pending = this.pendingSQLiteTransaction())) await pending;
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
