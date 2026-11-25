import { dbConnection } from '../database/connection.js';
import { Queue, type JobRecord } from './queue.js';
import type { Job } from './job.js';

const CLAIM_SECONDS = 60;
const RETRY_SECONDS = 5;

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

    const attempts = jobRecord.attempts + 1;
    const claim = await dbConnection.execute(
      `UPDATE ${q}_jobs${q} SET ${q}attempts${q} = ?, ${q}available_at${q} = ? WHERE ${q}id${q} = ? AND ${q}attempts${q} = ? AND ${q}available_at${q} <= ?;`,
      [attempts, now + CLAIM_SECONDS, jobRecord.id, jobRecord.attempts, now]
    );
    if (Number(claim.changes) === 0) return false;
    jobRecord.attempts = attempts;

    let job: Job;
    try {
      const JobClass = Queue.getJobClass(jobRecord.name);
      if (!JobClass) throw new Error(`Handler class not registered for: ${jobRecord.name}`);
      const parsed = JSON.parse(jobRecord.payload);
      job = new JobClass();
      if (parsed?.data && typeof parsed.data === 'object') {
        for (const [key, value] of Object.entries(parsed.data)) {
          if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype' && key !== 'handle') {
            (job as any)[key] = value;
          }
        }
      }
    } catch (error) {
      await Queue.failClaimedJob(jobRecord, String(error));
      console.error(`[BirQueue] Cannot load job #${jobRecord.id}:`, error);
      return false;
    }

    const maxTries = job.tries || 3;
    if (attempts > maxTries) {
      await Queue.failClaimedJob(jobRecord, 'Job claim expired after the final attempt.');
      return false;
    }
    const renew = setInterval(() => {
      const until = Math.floor(Date.now() / 1000) + CLAIM_SECONDS;
      void dbConnection.execute(
        `UPDATE ${q}_jobs${q} SET ${q}available_at${q} = ? WHERE ${q}id${q} = ? AND ${q}attempts${q} = ? AND ${q}available_at${q} > ?;`,
        [until, jobRecord.id, attempts, until - CLAIM_SECONDS + RETRY_SECONDS]
      ).catch((error) => console.error(`[BirQueue] Failed to renew claim for job #${jobRecord.id}:`, error));
    }, (CLAIM_SECONDS / 3) * 1000);
    renew.unref();

    try {
      await job.handle();
    } catch (error) {
      clearInterval(renew);
      console.error(`[BirQueue] Job #${jobRecord.id} failed:`, error);
      if (attempts >= maxTries) {
        await Queue.failClaimedJob(jobRecord, error instanceof Error ? error.stack || error.message : String(error));
      } else {
        const nextAttemptAt = Math.floor(Date.now() / 1000) + RETRY_SECONDS;
        await dbConnection.execute(
          `UPDATE ${q}_jobs${q} SET ${q}available_at${q} = ? WHERE ${q}id${q} = ? AND ${q}attempts${q} = ?;`,
          [nextAttemptAt, jobRecord.id, attempts]
        );
      }
      return false;
    } finally {
      clearInterval(renew);
    }

    const removed = await dbConnection.execute(
      `DELETE FROM ${q}_jobs${q} WHERE ${q}id${q} = ? AND ${q}attempts${q} = ?;`,
      [jobRecord.id, attempts]
    );
    return Number(removed.changes) > 0;
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
