import { ScheduleEvent, type ScheduledTask } from './event.js';
import { dispatch } from '../queue/queue.js';
import type { Job } from '../queue/job.js';

export class ScheduleManager {
  private events: ScheduleEvent[] = [];
  private isRunning: boolean = false;

  public call(callback: ScheduledTask, description?: string): ScheduleEvent {
    const event = new ScheduleEvent(callback, description);
    this.events.push(event);
    return event;
  }

  public job(job: Job, description?: string): ScheduleEvent {
    const desc = description || `Dispatch Job: ${job.constructor.name}`;
    return this.call(async () => {
      await dispatch(job);
    }, desc);
  }

  public getEvents(): ScheduleEvent[] {
    return this.events;
  }

  public async runDue(date: Date = new Date()): Promise<number> {
    let ranCount = 0;
    for (const event of this.events) {
      if (event.isDue(date)) {
        try {
          console.log(`\x1b[36m[Schedule]\x1b[0m Running task: ${event.descriptionText}`);
          const start = Date.now();
          await event.run();
          const duration = Date.now() - start;
          console.log(`\x1b[32m[Schedule]\x1b[0m Completed task: ${event.descriptionText} (${duration}ms)`);
          ranCount++;
        } catch (err: any) {
          console.error(`\x1b[31m[Schedule]\x1b[0m Task failed: ${event.descriptionText} - ${err.message}`);
        }
      }
    }
    return ranCount;
  }

  public async work(options: { sleepMs?: number; once?: boolean } = {}): Promise<void> {
    const sleepMs = options.sleepMs || 1000;
    this.isRunning = true;

    console.log(`\x1b[32m✔ BirFramework Task Scheduler started (${this.events.length} tasks registered)...\x1b[0m`);
    console.log(`\x1b[90m  Press Ctrl+C to stop the scheduler\x1b[0m\n`);

    while (this.isRunning) {
      await this.runDue();
      if (options.once) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }

  public stop(): void {
    this.isRunning = false;
  }
}

export const Schedule = new ScheduleManager();
