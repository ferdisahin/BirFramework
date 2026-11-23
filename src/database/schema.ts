import { dbConnection, type DatabaseConnection } from './connection.js';
import type { DatabaseDialect } from './drivers/driver.js';

function assertSafeIdentifier(name: string): void {
  if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`[BirSchema] Unsafe SQL identifier detected: "${name}"`);
  }
}

export class ColumnDefinition {
  public name: string;
  public type: string;
  public isNullable: boolean = false;
  public isUnique: boolean = false;
  public isPrimaryKey: boolean = false;
  public isAutoIncrement: boolean = false;
  public defaultValue?: any;

  constructor(name: string, type: string) {
    assertSafeIdentifier(name);
    this.name = name;
    this.type = type;
  }

  public nullable(): this {
    this.isNullable = true;
    return this;
  }

  public unique(): this {
    this.isUnique = true;
    return this;
  }

  public primary(): this {
    this.isPrimaryKey = true;
    return this;
  }

  public default(value: any): this {
    this.defaultValue = value;
    return this;
  }

  public toSql(dialect: DatabaseDialect = 'sqlite'): string {
    const q = dialect === 'postgres' ? '"' : '`';
    const parts = [`${q}${this.name}${q}`];

    if (this.isPrimaryKey && this.isAutoIncrement) {
      if (dialect === 'postgres') {
        parts.push('SERIAL PRIMARY KEY');
        return parts.join(' ');
      } else if (dialect === 'mysql') {
        parts.push('INT AUTO_INCREMENT PRIMARY KEY');
        return parts.join(' ');
      } else {
        // SQLite
        parts.push('INTEGER PRIMARY KEY AUTOINCREMENT');
        return parts.join(' ');
      }
    }

    parts.push(this.type);

    if (this.isPrimaryKey) {
      parts.push('PRIMARY KEY');
    }
    if (!this.isNullable && !this.isPrimaryKey) {
      parts.push('NOT NULL');
    }
    if (this.isUnique) {
      parts.push('UNIQUE');
    }
    if (this.defaultValue !== undefined) {
      const formatted = typeof this.defaultValue === 'string'
        ? `'${this.defaultValue.replace(/'/g, "''")}'`
        : this.defaultValue;
      parts.push(`DEFAULT ${formatted}`);
    }

    return parts.join(' ');
  }
}

export class Blueprint {
  public columns: ColumnDefinition[] = [];

  public id(name: string = 'id'): ColumnDefinition {
    const col = new ColumnDefinition(name, 'INTEGER');
    col.isPrimaryKey = true;
    col.isAutoIncrement = true;
    this.columns.push(col);
    return col;
  }

  public string(name: string, length: number = 255): ColumnDefinition {
    const col = new ColumnDefinition(name, `VARCHAR(${length})`);
    this.columns.push(col);
    return col;
  }

  public text(name: string): ColumnDefinition {
    const col = new ColumnDefinition(name, 'TEXT');
    this.columns.push(col);
    return col;
  }

  public integer(name: string): ColumnDefinition {
    const col = new ColumnDefinition(name, 'INTEGER');
    this.columns.push(col);
    return col;
  }

  public float(name: string): ColumnDefinition {
    const col = new ColumnDefinition(name, 'REAL');
    this.columns.push(col);
    return col;
  }

  public boolean(name: string): ColumnDefinition {
    const col = new ColumnDefinition(name, 'BOOLEAN');
    this.columns.push(col);
    return col;
  }

  public json(name: string): ColumnDefinition {
    const col = new ColumnDefinition(name, 'TEXT');
    this.columns.push(col);
    return col;
  }

  public timestamps(): void {
    this.string('created_at').nullable();
    this.string('updated_at').nullable();
  }

  public toSql(tableName: string, dialect: DatabaseDialect = 'sqlite'): string {
    assertSafeIdentifier(tableName);
    const q = dialect === 'postgres' ? '"' : '`';
    const columnDefs = this.columns.map((c) => c.toSql(dialect)).join(',\n  ');
    return `CREATE TABLE IF NOT EXISTS ${q}${tableName}${q} (\n  ${columnDefs}\n);`;
  }
}

export class SchemaBuilder {
  constructor(private connection: DatabaseConnection = dbConnection) {}

  public async create(tableName: string, callback: (table: Blueprint) => void): Promise<void> {
    assertSafeIdentifier(tableName);
    const blueprint = new Blueprint();
    callback(blueprint);
    const sql = blueprint.toSql(tableName, this.connection.dialect);
    await this.connection.exec(sql);
  }

  public async dropIfExists(tableName: string): Promise<void> {
    assertSafeIdentifier(tableName);
    const q = this.connection.dialect === 'postgres' ? '"' : '`';
    await this.connection.exec(`DROP TABLE IF EXISTS ${q}${tableName}${q};`);
  }

  public async hasTable(tableName: string): Promise<boolean> {
    if (this.connection.dialect === 'postgres') {
      const row = await this.connection.queryOne(
        `SELECT tablename FROM pg_catalog.pg_tables WHERE tablename = $1;`,
        [tableName]
      );
      return Boolean(row);
    } else if (this.connection.dialect === 'mysql') {
      const row = await this.connection.queryOne(
        `SHOW TABLES LIKE ?;`,
        [tableName]
      );
      return Boolean(row);
    } else {
      const row = await this.connection.queryOne(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = ?;`,
        [tableName]
      );
      return Boolean(row);
    }
  }
}

export const Schema = new SchemaBuilder();
