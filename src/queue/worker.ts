import { dbConnection } from '../database/connection.js';
import { Queue, type JobRecord } from './queue.js';
import type { Job } from './job.js';

export interface WorkerOptions {
  queue?: string;
  sleepMs?: number;
  once?: boolean;
}

export class QueueWorker {
  private isRunning: boolean = false;

  public async processNext(queue: string = 'default'): Promise<boolean> {
    await Queue.ensureQueueTable();

    const now = Math.floor(Date.now() / 1000);
    const q = dbConnection.dialect === 'postgres' ? '"' : '`';

    const jobRecord = await dbConnection.queryOne<JobRecord>(
      `SELECT * FROM ${q}_jobs${q} WHERE ${q}queue${q} = ? AND ${q}available_at${q} <= ? ORDER BY ${q}id${q} ASC LIMIT 1;`,
      [queue, now]
    );

    if (!jobRecord) {
      return false;
    }

    const JobClass = Queue.getJobClass(jobRecord.name);
    let jobInstance: Job;

    try {
      const parsed = JSON.parse(jobRecord.payload);
      if (JobClass) {
        jobInstance = new JobClass();
        Object.assign(jobInstance, parsed.data);
      } else {
        // Fallback generic object with handle if class not pre-registered
        jobInstance = {
          ...parsed.data,
          handle: () => {
            console.warn(`[BirQueue Worker] Handler class not registered for: ${jobRecord.name}`);
          },
        } as any;
      }
    } catch (err: any) {
      console.error(`[BirQueue Worker] Failed to deserialize job #${jobRecord.id}: ${err.message}`);
      await dbConnection.execute(`DELETE FROM ${q}_jobs${q} WHERE ${q}id${q} = ?;`, [jobRecord.id]);
      return false;
    }

    // Execute job
    const attempts = jobRecord.attempts + 1;
    const maxTries = jobInstance.tries || 3;

    try {
      console.log(`\x1b[36m[Queue]\x1b[0m Processing: ${jobRecord.name} (Job #${jobRecord.id})`);
      const start = Date.now();
      await jobInstance.handle();
      const duration = Date.now() - start;

      // Successfully finished, remove from queue
      await dbConnection.execute(`DELETE FROM ${q}_jobs${q} WHERE ${q}id${q} = ?;`, [jobRecord.id]);
      console.log(`\x1b[32m[Queue]\x1b[0m Processed:  ${jobRecord.name} (${duration}ms)`);
      return true;
    } catch (err: any) {
      console.error(`\x1b[31m[Queue]\x1b[0m Failed:     ${jobRecord.name} - ${err.message}`);

      if (attempts >= maxTries) {
        console.error(`\x1b[31m[Queue]\x1b[0m Max attempts (${maxTries}) reached. Discarding job #${jobRecord.id}.`);
        await dbConnection.execute(`DELETE FROM ${q}_jobs${q} WHERE ${q}id${q} = ?;`, [jobRecord.id]);
      } else {
        // Retry with backoff (e.g. 5 seconds delay)
        const nextAttemptAt = Math.floor(Date.now() / 1000) + 5;
        await dbConnection.execute(
          `UPDATE ${q}_jobs${q} SET ${q}attempts${q} = ?, ${q}available_at${q} = ? WHERE ${q}id${q} = ?;`,
          [attempts, nextAttemptAt, jobRecord.id]
        );
      }
      return false;
    }
  }

  public async work(options: WorkerOptions = {}): Promise<void> {
    const queue = options.queue || 'default';
    const sleepMs = options.sleepMs || 1000;
    this.isRunning = true;

    console.log(`\x1b[32m✔ BirFramework Queue Worker started on [${queue}] queue...\x1b[0m`);
    console.log(`\x1b[90m  Press Ctrl+C to stop the worker\x1b[0m\n`);

    while (this.isRunning) {
      const processed = await this.processNext(queue);
      if (options.once) {
        break;
      }
      if (!processed) {
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
      }
    }
  }

  public stop(): void {
    this.isRunning = false;
  }
}

export const worker = new QueueWorker();
