import { readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { dbConnection, type DatabaseConnection } from './connection.js';

export abstract class Migration {
  abstract up(): Promise<void> | void;
  abstract down(): Promise<void> | void;
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
    const textType = isPg ? 'VARCHAR(255)' : 'TEXT';

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
    const q = this.connection.dialect === 'postgres' ? '"' : '`';
    return this.connection.query<{ name: string; batch: number }>(
      `SELECT ${q}name${q}, ${q}batch${q} FROM ${q}_migrations${q} ORDER BY ${q}id${q} ASC;`
    );
  }

  public async getNextBatchNumber(): Promise<number> {
    await this.ensureMigrationsTable();
    const q = this.connection.dialect === 'postgres' ? '"' : '`';
    const row = await this.connection.queryOne<{ maxBatch: number }>(
      `SELECT MAX(${q}batch${q}) as maxBatch FROM ${q}_migrations${q};`
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

    const files = readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .sort();

    const pending = files.filter((f) => !executedNames.has(f));
    if (pending.length === 0) {
      return [];
    }

    const batch = await this.getNextBatchNumber();
    const executedNow: string[] = [];
    const q = this.connection.dialect === 'postgres' ? '"' : '`';

    for (const file of pending) {
      const fullPath = join(this.migrationsDir, file);
      const mod = await import(fullPath);
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
      `SELECT MAX(${q}batch${q}) as maxBatch FROM ${q}_migrations${q};`
    );
    const lastBatch = lastBatchRow?.maxBatch;
    if (!lastBatch) {
      return [];
    }

    const toRollback = await this.connection.query<{ name: string }>(
      `SELECT ${q}name${q} FROM ${q}_migrations${q} WHERE ${q}batch${q} = ? ORDER BY ${q}id${q} DESC;`,
      [lastBatch]
    );

    const rolledBack: string[] = [];
    for (const record of toRollback) {
      const fullPath = join(this.migrationsDir, record.name);
      if (existsSync(fullPath)) {
        const mod = await import(fullPath);
        let migration: any = mod.default || mod;
        if (typeof migration === 'function') {
          migration = new migration();
        }
        if (typeof migration.down === 'function') {
          await migration.down();
        }
      }
      await this.connection.execute(`DELETE FROM ${q}_migrations${q} WHERE ${q}name${q} = ?;`, [record.name]);
      rolledBack.push(record.name);
    }

    return rolledBack;
  }
}

export const migrator = new Migrator();
