import { readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SchemaBuilder } from './schema.js';
import { SqliteDriver } from './drivers/sqlite.js';
import { dbConnection, type DatabaseConnection } from './connection.js';

export abstract class Migration {
  abstract up(): Promise<void> | void;
  abstract down(): Promise<void> | void;
}

export interface MigrationStatus {
  name: string;
  status: 'applied' | 'pending' | 'missing';
  batch: number | null;
}

export class Migrator {
  private migrationsDir: string;
  private connection: DatabaseConnection;

  constructor(migrationsDir?: string, connection: DatabaseConnection = dbConnection) {
    this.migrationsDir = migrationsDir || resolve(process.cwd(), 'database/migrations');
    this.connection = connection;
  }

  public async ensureMigrationsTable(): Promise<void> {
    const isPg = this.connection.dialect === 'postgres';
    const q = isPg ? '"' : '`';
    const idDef = isPg ? 'SERIAL PRIMARY KEY' : this.connection.dialect === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const textType = this.connection.dialect === 'sqlite' ? 'TEXT' : 'VARCHAR(255)';

    await this.connection.exec(`
      CREATE TABLE IF NOT EXISTS ${q}_migrations${q} (
        ${q}id${q} ${idDef},
        ${q}name${q} ${textType} NOT NULL UNIQUE,
        ${q}batch${q} INTEGER NOT NULL,
        ${q}executed_at${q} ${textType} NOT NULL
      );
    `);
  }

  public async getExecutedMigrations(): Promise<{ name: string; batch: number }[]> {
    await this.ensureMigrationsTable();
    return this.readHistory();
  }

  private readHistory(): Promise<{ name: string; batch: number }[]> {
    const q = this.connection.dialect === 'postgres' ? '"' : '`';
    return this.connection.query<{ name: string; batch: number }>(
      `SELECT ${q}name${q}, ${q}batch${q} FROM ${q}_migrations${q} ORDER BY ${q}id${q} ASC;`
    );
  }

  private listFiles(): string[] {
    if (!existsSync(this.migrationsDir)) return [];
    return readdirSync(this.migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:js|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
      .map((entry) => entry.name)
      .sort();
  }

  public async status(): Promise<MigrationStatus[]> {
    const driver = this.connection.getDriver();
    const hasDatabase = !(driver instanceof SqliteDriver) || driver.hasDatabaseFile();
    const hasHistory = hasDatabase && await new SchemaBuilder(this.connection).hasTable('_migrations');
    const history = new Map(hasHistory ? (await this.readHistory()).map((row) => [row.name, row.batch]) : []);
    const status: MigrationStatus[] = this.listFiles().map((name) => {
      const batch = history.get(name);
      history.delete(name);
      return { name, status: batch === undefined ? 'pending' : 'applied', batch: batch ?? null };
    });
    for (const [name, batch] of history) status.push({ name, status: 'missing', batch });
    return status;
  }

  public async getNextBatchNumber(): Promise<number> {
    await this.ensureMigrationsTable();
    const q = this.connection.dialect === 'postgres' ? '"' : '`';
    const row = await this.connection.queryOne<{ maxBatch: number }>(
      `SELECT MAX(${q}batch${q}) AS ${q}maxBatch${q} FROM ${q}_migrations${q};`
    );
    return (row?.maxBatch || 0) + 1;
  }

  public async run(): Promise<string[]> {
    await this.ensureMigrationsTable();
    if (!existsSync(this.migrationsDir)) {
      return [];
    }

    const executed = await this.getExecutedMigrations();
    const executedNames = new Set(executed.map((m) => m.name));

    const files = this.listFiles();

    const pending = files.filter((f) => !executedNames.has(f));
    if (pending.length === 0) {
      return [];
    }

    const batch = await this.getNextBatchNumber();
    const executedNow: string[] = [];
    const q = this.connection.dialect === 'postgres' ? '"' : '`';

    for (const file of pending) {
      const fullPath = join(this.migrationsDir, file);
      const mod = await import(pathToFileURL(fullPath).href);
      let migration: any = mod.default || mod;

      if (typeof migration === 'function') {
        migration = new migration();
      }

      if (typeof migration.up === 'function') {
        await migration.up();
        await this.connection.execute(
          `INSERT INTO ${q}_migrations${q} (${q}name${q}, ${q}batch${q}, ${q}executed_at${q}) VALUES (?, ?, ?);`,
          [file, batch, new Date().toISOString()]
        );
        executedNow.push(file);
      }
    }

    return executedNow;
  }

  public async rollback(): Promise<string[]> {
    await this.ensureMigrationsTable();
    const q = this.connection.dialect === 'postgres' ? '"' : '`';
    const lastBatchRow = await this.connection.queryOne<{ maxBatch: number }>(
      `SELECT MAX(${q}batch${q}) AS ${q}maxBatch${q} FROM ${q}_migrations${q};`
    );
    const lastBatch = lastBatchRow?.maxBatch;
    if (!lastBatch) {
      return [];
    }

    const toRollback = await this.connection.query<{ name: string }>(
      `SELECT ${q}name${q} FROM ${q}_migrations${q} WHERE ${q}batch${q} = ? ORDER BY ${q}id${q} DESC;`,
      [lastBatch]
    );

    const available = new Set(this.listFiles());
    const migrations = await Promise.all(toRollback.map(async ({ name }) => {
      if (!available.has(name)) throw new Error(`[BirDatabase] Cannot roll back missing migration: ${name}`);
      const mod = await import(pathToFileURL(join(this.migrationsDir, name)).href);
      const exported = mod.default || mod;
      const migration = typeof exported === 'function' ? new exported() : exported;
      if (typeof migration.down !== 'function') {
        throw new Error(`[BirDatabase] Migration has no down() method: ${name}`);
      }
      return { name, migration };
    }));

    const rolledBack: string[] = [];
    for (const { name, migration } of migrations) {
      await migration.down();
      await this.connection.execute(`DELETE FROM ${q}_migrations${q} WHERE ${q}name${q} = ?;`, [name]);
      rolledBack.push(name);
    }

    return rolledBack;
  }
}

export const migrator = new Migrator();
