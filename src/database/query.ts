import { DatabaseConnection, dbConnection } from './connection.js';
import { paginate as createPaginator, type LengthAwarePaginator, type PaginationOptions } from '../pagination/index.js';

type WhereClause = {
  column: string;
  operator: string;
  value: any;
  boolean: 'AND' | 'OR';
};

export class QueryBuilder<T = any> {
  private tableName: string;
  private selectedColumns: string[] = ['*'];
  private whereClauses: WhereClause[] = [];
  private orderClauses: { column: string; direction: 'ASC' | 'DESC' }[] = [];
  private limitCount?: number;
  private offsetCount?: number;
  private connection: DatabaseConnection;
  private modelClass?: new (attributes: any, exists: boolean) => T;

  constructor(
    tableName: string,
    connection: DatabaseConnection = dbConnection,
    modelClass?: new (attributes: any, exists: boolean) => T
  ) {
    this.tableName = tableName;
    this.connection = connection;
    this.modelClass = modelClass;
  }

  public select(...columns: string[]): this {
    this.selectedColumns = columns;
    return this;
  }

  public where(column: string, operatorOrValue: any, value?: any): this {
    return this.addWhere('AND', column, operatorOrValue, value);
  }

  public orWhere(column: string, operatorOrValue: any, value?: any): this {
    return this.addWhere('OR', column, operatorOrValue, value);
  }

  public whereIn(column: string, values: any[]): this {
    if (values.length === 0) {
      this.where('1', '=', '0');
      return this;
    }
    const placeholders = values.map(() => '?').join(', ');
    return this.addWhereRaw('AND', `\`${column}\` IN (${placeholders})`, values);
  }

  public whereNull(column: string): this {
    return this.addWhereRaw('AND', `\`${column}\` IS NULL`, []);
  }

  public whereNotNull(column: string): this {
    return this.addWhereRaw('AND', `\`${column}\` IS NOT NULL`, []);
  }

  public orderBy(column: string, direction: 'asc' | 'desc' | 'ASC' | 'DESC' = 'ASC'): this {
    this.orderClauses.push({
      column,
      direction: direction.toUpperCase() as 'ASC' | 'DESC',
    });
    return this;
  }

  public latest(column: string = 'created_at'): this {
    return this.orderBy(column, 'DESC');
  }

  public oldest(column: string = 'created_at'): this {
    return this.orderBy(column, 'ASC');
  }

  public limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  public offset(count: number): this {
    this.offsetCount = count;
    return this;
  }

  public async get(): Promise<T[]> {
    const { sql, params } = this.toSql();
    const rows = await this.connection.query<any>(sql, params);
    if (this.modelClass) {
      return rows.map((r) => new this.modelClass!(r, true));
    }
    return rows as T[];
  }

  public async first(): Promise<T | null> {
    const originalLimit = this.limitCount;
    this.limitCount = 1;
    const { sql, params } = this.toSql();
    this.limitCount = originalLimit;
    const row = await this.connection.queryOne<any>(sql, params);
    if (!row) return null;
    if (this.modelClass) {
      return new this.modelClass(row, true);
    }
    return row as T;
  }

  public async find(id: any): Promise<T | null> {
    return this.where('id', '=', id).first();
  }

  public async count(column: string = '*'): Promise<number> {
    const originalSelect = this.selectedColumns;
    this.selectedColumns = [`COUNT(${column === '*' ? '*' : '`' + column + '`'}) as aggregate`];
    const { sql, params } = this.toSql();
    this.selectedColumns = originalSelect;

    const row = await this.connection.queryOne<{ aggregate: number }>(sql, params);
    return row ? Number(row.aggregate) : 0;
  }

  public async exists(): Promise<boolean> {
    const count = await this.count();
    return count > 0;
  }

  public async insert(data: Record<string, any> | Record<string, any>[]): Promise<{ lastInsertRowid: number | bigint }> {
    const records = Array.isArray(data) ? data : [data];
    if (records.length === 0) return { lastInsertRowid: 0 };

    const first = records[0]!;
    const columns = Object.keys(first);
    const placeholders = `(${columns.map(() => '?').join(', ')})`;

    const allValues: any[] = [];
    const valuesPlaceholders: string[] = [];

    for (const record of records) {
      valuesPlaceholders.push(placeholders);
      for (const col of columns) {
        allValues.push(record[col]);
      }
    }

    const sql = `INSERT INTO \`${this.tableName}\` (\`${columns.join('`, `')}\`) VALUES ${valuesPlaceholders.join(', ')}`;
    const result = await this.connection.execute(sql, allValues);
    return { lastInsertRowid: result.lastInsertRowid };
  }

  public async update(data: Record<string, any>): Promise<number> {
    const entries = Object.entries(data);
    if (entries.length === 0) return 0;

    const setClauses = entries.map(([col]) => `\`${col}\` = ?`).join(', ');
    const params: any[] = entries.map(([, val]) => val);

    let sql = `UPDATE \`${this.tableName}\` SET ${setClauses}`;
    const { whereSql, whereParams } = this.buildWhere();
    if (whereSql) {
      sql += ` WHERE ${whereSql}`;
      params.push(...whereParams);
    }

    const result = await this.connection.execute(sql, params);
    return Number(result.changes);
  }

  public async delete(): Promise<number> {
    let sql = `DELETE FROM \`${this.tableName}\``;
    const { whereSql, whereParams } = this.buildWhere();
    if (whereSql) {
      sql += ` WHERE ${whereSql}`;
    }

    const result = await this.connection.execute(sql, whereParams);
    return Number(result.changes);
  }

  public async paginate(options: PaginationOptions = {}): Promise<LengthAwarePaginator<T>> {
    const page = Math.max(1, Number(options.page) || 1);
    const perPage = Math.max(1, Number(options.perPage) || 15);

    const total = await this.count();

    this.limit(perPage).offset((page - 1) * perPage);
    const items = await this.get();

    return createPaginator(items, { page, perPage, total, path: options.path }, true);
  }

  public toSql(): { sql: string; params: any[] } {
    const cols = this.selectedColumns.join(', ');
    let sql = `SELECT ${cols} FROM \`${this.tableName}\``;
    const params: any[] = [];

    const { whereSql, whereParams } = this.buildWhere();
    if (whereSql) {
      sql += ` WHERE ${whereSql}`;
      params.push(...whereParams);
    }

    if (this.orderClauses.length > 0) {
      const orders = this.orderClauses.map((o) => `\`${o.column}\` ${o.direction}`).join(', ');
      sql += ` ORDER BY ${orders}`;
    }

    if (this.limitCount !== undefined) {
      sql += ` LIMIT ${this.limitCount}`;
    }

    if (this.offsetCount !== undefined) {
      sql += ` OFFSET ${this.offsetCount}`;
    }

    return { sql, params };
  }

  private addWhere(boolean: 'AND' | 'OR', column: string, operatorOrValue: any, value?: any): this {
    let operator = '=';
    let val = operatorOrValue;

    if (value !== undefined) {
      operator = operatorOrValue;
      val = value;
    }

    this.whereClauses.push({
      column,
      operator,
      value: val,
      boolean,
    });
    return this;
  }

  private addWhereRaw(boolean: 'AND' | 'OR', rawSql: string, params: any[]): this {
    this.whereClauses.push({
      column: rawSql,
      operator: 'RAW',
      value: params,
      boolean,
    });
    return this;
  }

  private buildWhere(): { whereSql: string; whereParams: any[] } {
    if (this.whereClauses.length === 0) {
      return { whereSql: '', whereParams: [] };
    }

    const parts: string[] = [];
    const params: any[] = [];

    for (let i = 0; i < this.whereClauses.length; i++) {
      const w = this.whereClauses[i]!;
      const prefix = i === 0 ? '' : ` ${w.boolean} `;

      if (w.operator === 'RAW') {
        parts.push(`${prefix}${w.column}`);
        if (Array.isArray(w.value)) {
          params.push(...w.value);
        }
      } else {
        parts.push(`${prefix}\`${w.column}\` ${w.operator} ?`);
        params.push(w.value);
      }
    }

    return { whereSql: parts.join(''), whereParams: params };
  }
}

export const DB = {
  table: <T = any>(tableName: string) => new QueryBuilder<T>(tableName),
  raw: async <T = any>(sql: string, params: any[] = []) => dbConnection.query<T>(sql, params),
  execute: async (sql: string, params: any[] = []) => dbConnection.execute(sql, params),
  transaction: <T = any>(callback: () => Promise<T>) => dbConnection.transaction<T>(callback),
  connection: dbConnection,
};
