export type ScheduledTask = () => Promise<void> | void;

export class ScheduleEvent {
  public descriptionText: string = 'Anonymous Task';
  private callback: ScheduledTask;
  private intervalSeconds: number = 60;
  private specificHour?: number;
  private specificMinute?: number;
  private lastRunAt: number = 0;

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

  public isDue(date: Date = new Date()): boolean {
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
    this.lastRunAt = Math.floor(Date.now() / 1000);
    await this.callback();
  }
}
