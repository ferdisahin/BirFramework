import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type ScheduledTask = () => Promise<void> | void;

export class ScheduleEvent {
  public descriptionText: string = 'Anonymous Task';
  private callback: ScheduledTask;
  private intervalSeconds: number = 60;
  private specificHour?: number;
  private specificMinute?: number;
  private lastRunAt: number = 0;
  private preventOverlap: boolean = false;
  private overlapTtlSeconds: number = 3600;
  private lockDir?: string;
  private isRunning: boolean = false;

  constructor(callback: ScheduledTask, description?: string) {
    this.callback = callback;
    if (description) this.descriptionText = description;
  }

  public description(desc: string): this {
    this.descriptionText = desc;
    return this;
  }

  public everySecond(): this {
    this.intervalSeconds = 1;
    return this;
  }

  public everyMinute(): this {
    this.intervalSeconds = 60;
    return this;
  }

  public everyFiveMinutes(): this {
    this.intervalSeconds = 300;
    return this;
  }

  public everyTenMinutes(): this {
    this.intervalSeconds = 600;
    return this;
  }

  public everyThirtyMinutes(): this {
    this.intervalSeconds = 1800;
    return this;
  }

  public hourly(): this {
    this.intervalSeconds = 3600;
    return this;
  }

  public daily(): this {
    this.intervalSeconds = 86400;
    return this;
  }

  public dailyAt(timeStr: string): this {
    const [h, m] = timeStr.split(':').map(Number);
    this.specificHour = h;
    this.specificMinute = m || 0;
    this.intervalSeconds = 86400;
    return this;
  }

  /**
   * Prevent this scheduled task from overlapping across ticks or worker processes.
   */
  public withoutOverlapping(ttlSeconds: number = 3600, lockDir?: string): this {
    this.preventOverlap = true;
    this.overlapTtlSeconds = Math.max(1, ttlSeconds);
    this.lockDir = lockDir;
    return this;
  }

  private getLockFilePath(): string {
    const dir = this.lockDir ? resolve(this.lockDir) : resolve(process.cwd(), 'storage/framework/locks');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const hash = createHash('sha1').update(this.descriptionText).digest('hex').slice(0, 12);
    return join(dir, `schedule-${hash}.lock`);
  }

  private isLockHeldExternally(): boolean {
    if (!this.preventOverlap) return false;
    const lockPath = this.getLockFilePath();
    if (!existsSync(lockPath)) return false;
    try {
      const data = JSON.parse(readFileSync(lockPath, 'utf-8'));
      if (data.expiresAt && Date.now() < Number(data.expiresAt)) {
        return true;
      }
      rmSync(lockPath, { force: true });
      return false;
    } catch {
      return false;
    }
  }

  private acquireCrossProcessLock(): boolean {
    const lockPath = this.getLockFilePath();
    const payload = JSON.stringify({
      pid: process.pid,
      expiresAt: Date.now() + this.overlapTtlSeconds * 1000,
    });
    try {
      writeFileSync(lockPath, payload, { flag: 'wx' });
      return true;
    } catch {
      if (!this.isLockHeldExternally()) {
        try {
          writeFileSync(lockPath, payload, { flag: 'wx' });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  private releaseCrossProcessLock(): void {
    try {
      rmSync(this.getLockFilePath(), { force: true });
    } catch {
      // ignore
    }
  }

  public isDue(date: Date = new Date()): boolean {
    if (this.preventOverlap && (this.isRunning || this.isLockHeldExternally())) {
      return false;
    }

    const nowTimestamp = Math.floor(date.getTime() / 1000);

    // If specific time of day is required (dailyAt)
    if (this.specificHour !== undefined && this.specificMinute !== undefined) {
      if (date.getHours() !== this.specificHour || date.getMinutes() !== this.specificMinute) {
        return false;
      }
      // Only run once during that minute
      return nowTimestamp - this.lastRunAt >= 60;
    }

    if (this.lastRunAt === 0) {
      return true;
    }

    return nowTimestamp - this.lastRunAt >= this.intervalSeconds;
  }

  public async run(): Promise<void> {
    if (this.preventOverlap) {
      if (this.isRunning || !this.acquireCrossProcessLock()) {
        return;
      }
    }

    this.isRunning = true;
    this.lastRunAt = Math.floor(Date.now() / 1000);
    try {
      await this.callback();
    } finally {
      this.isRunning = false;
      if (this.preventOverlap) {
        this.releaseCrossProcessLock();
      }
    }
  }
}
