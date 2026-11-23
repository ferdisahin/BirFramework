export type DatabaseDialect = 'sqlite' | 'postgres' | 'mysql';

export interface QueryResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
  rows?: any[];
}

export interface DatabaseDriver {
  readonly dialect: DatabaseDialect;
  connect(): Promise<void> | void;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<QueryResult>;
  exec(sql: string): Promise<void>;
  close(): Promise<void> | void;
}
