import { dbConnection } from '../database/connection.js';
import { Job } from './job.js';

export interface JobRecord {
  id: number;
  queue: string;
  name: string;
  payload: string;
  attempts: number;
  available_at: number;
  created_at: string;
}

export class QueueManager {
  private jobRegistry = new Map<string, new (...args: any[]) => Job>();

  public register(jobClass: new (...args: any[]) => Job): this {
    this.jobRegistry.set(jobClass.name, jobClass);
    return this;
  }

  public getJobClass(name: string): (new (...args: any[]) => Job) | undefined {
    return this.jobRegistry.get(name);
  }

  public async ensureQueueTable(): Promise<void> {
    const isPg = dbConnection.dialect === 'postgres';
    const q = isPg ? '"' : '`';
    const idDef = isPg ? 'SERIAL PRIMARY KEY' : dbConnection.dialect === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const textType = isPg ? 'VARCHAR(255)' : 'TEXT';
    const longTextType = isPg ? 'TEXT' : 'TEXT';

    await dbConnection.exec(`
      CREATE TABLE IF NOT EXISTS ${q}_jobs${q} (
        ${q}id${q} ${idDef},
        ${q}queue${q} ${textType} NOT NULL,
        ${q}name${q} ${textType} NOT NULL,
        ${q}payload${q} ${longTextType} NOT NULL,
        ${q}attempts${q} INTEGER NOT NULL DEFAULT 0,
        ${q}available_at${q} INTEGER NOT NULL,
        ${q}created_at${q} ${textType} NOT NULL
      );
    `);
  }

  public async push(job: Job): Promise<number> {
    await this.ensureQueueTable();

    const name = job.constructor.name;
    this.jobRegistry.set(name, job.constructor as new (...args: any[]) => Job);

    // Extract all instance properties for payload
    const serializedPayload = JSON.stringify({
      data: { ...job },
    });

    const now = Math.floor(Date.now() / 1000);
    const availableAt = now + (job.delaySeconds || 0);

    const q = dbConnection.dialect === 'postgres' ? '"' : '`';
    const result = await dbConnection.execute(
      `INSERT INTO ${q}_jobs${q} (${q}queue${q}, ${q}name${q}, ${q}payload${q}, ${q}attempts${q}, ${q}available_at${q}, ${q}created_at${q}) VALUES (?, ?, ?, 0, ?, ?);`,
      [job.queue || 'default', name, serializedPayload, availableAt, new Date().toISOString()]
    );

    return Number(result.lastInsertRowid);
  }
}

export const Queue = new QueueManager();

/**
 * Global helper to dispatch background jobs
 * dispatch(new SendEmailJob(user))
 */
export async function dispatch(job: Job): Promise<number> {
  return Queue.push(job);
}
