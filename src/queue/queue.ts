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

export interface FailedJobRecord {
  id: number;
  queue: string;
  name: string;
  payload: string;
  exception: string;
  failed_at: string;
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

    await dbConnection.exec(`
      CREATE TABLE IF NOT EXISTS ${q}_failed_jobs${q} (
        ${q}id${q} ${idDef},
        ${q}queue${q} ${textType} NOT NULL,
        ${q}name${q} ${textType} NOT NULL,
        ${q}payload${q} ${longTextType} NOT NULL,
        ${q}exception${q} ${longTextType} NOT NULL,
        ${q}failed_at${q} ${textType} NOT NULL
      );
    `);
  }

  public async recordFailedJob(jobRecord: JobRecord, exception: string): Promise<number> {
    await this.ensureQueueTable();
    return this.insertFailedJob(jobRecord, exception);
  }

  public async failClaimedJob(jobRecord: JobRecord, exception: string): Promise<void> {
    const q = dbConnection.dialect === 'postgres' ? '"' : '`';
    await dbConnection.transaction(async () => {
      const result = await dbConnection.execute(
        `DELETE FROM ${q}_jobs${q} WHERE ${q}id${q} = ? AND ${q}attempts${q} = ?;`,
        [jobRecord.id, jobRecord.attempts]
      );
      if (Number(result.changes) > 0) await this.insertFailedJob(jobRecord, exception);
    });
  }

  private async insertFailedJob(jobRecord: JobRecord, exception: string): Promise<number> {
    const q = dbConnection.dialect === 'postgres' ? '"' : '`';
    const result = await dbConnection.execute(
      `INSERT INTO ${q}_failed_jobs${q} (${q}queue${q}, ${q}name${q}, ${q}payload${q}, ${q}exception${q}, ${q}failed_at${q}) VALUES (?, ?, ?, ?, ?);`,
      [jobRecord.queue, jobRecord.name, jobRecord.payload, exception, new Date().toISOString()]
    );
    return Number(result.lastInsertRowid);
  }

  public async getFailedJobs(): Promise<FailedJobRecord[]> {
    await this.ensureQueueTable();
    const q = dbConnection.dialect === 'postgres' ? '"' : '`';
    return dbConnection.query<FailedJobRecord>(`SELECT * FROM ${q}_failed_jobs${q} ORDER BY ${q}id${q} DESC;`);
  }

  public async retryFailedJob(idOrAll: number | 'all' = 'all'): Promise<number> {
    await this.ensureQueueTable();
    const q = dbConnection.dialect === 'postgres' ? '"' : '`';
    return dbConnection.transaction(async () => {
      const failed = idOrAll === 'all'
        ? await dbConnection.query<FailedJobRecord>(`SELECT * FROM ${q}_failed_jobs${q} ORDER BY ${q}id${q} DESC;`)
        : await dbConnection.query<FailedJobRecord>(`SELECT * FROM ${q}_failed_jobs${q} WHERE ${q}id${q} = ?;`, [idOrAll]);

      const now = Math.floor(Date.now() / 1000);
      let retried = 0;
      for (const item of failed) {
        const removed = await dbConnection.execute(`DELETE FROM ${q}_failed_jobs${q} WHERE ${q}id${q} = ?;`, [item.id]);
        if (Number(removed.changes) === 0) continue;
        await dbConnection.execute(
          `INSERT INTO ${q}_jobs${q} (${q}queue${q}, ${q}name${q}, ${q}payload${q}, ${q}attempts${q}, ${q}available_at${q}, ${q}created_at${q}) VALUES (?, ?, ?, 0, ?, ?);`,
          [item.queue, item.name, item.payload, now, new Date().toISOString()]
        );
        retried++;
      }
      return retried;
    });
  }

  public async flushFailedJobs(): Promise<number> {
    await this.ensureQueueTable();
    const q = dbConnection.dialect === 'postgres' ? '"' : '`';
    const res = await dbConnection.execute(`DELETE FROM ${q}_failed_jobs${q};`);
    return Number(res.changes);
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
