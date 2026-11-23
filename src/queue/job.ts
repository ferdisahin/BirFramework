export abstract class Job {
  public queue: string = 'default';
  public tries: number = 3;
  public delaySeconds: number = 0;

  public onQueue(queue: string): this {
    this.queue = queue;
    return this;
  }

  public delay(seconds: number): this {
    this.delaySeconds = seconds;
    return this;
  }

  abstract handle(): Promise<void> | void;
}
