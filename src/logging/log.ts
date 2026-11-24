import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

export class Log {
  public static logFile: string | null = null;

  public static getLogPath(): string {
    if (this.logFile) return this.logFile;
    const dir = join(process.cwd(), 'storage', 'logs');
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        // ignore in read-only environments
      }
    }
    return join(dir, 'bir.log');
  }

  public static write(level: LogLevel, message: string, context: Record<string, any> = {}): void {
    const timestamp = new Date().toISOString();
    const contextStr = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
    const formatted = `[${timestamp}] bir.${level.toUpperCase()}: ${message}${contextStr}\n`;

    try {
      appendFileSync(this.getLogPath(), formatted, 'utf-8');
    } catch {
      // ignore write errors in serverless or read-only environments
    }
  }

  public static debug(message: string, context?: Record<string, any>): void {
    this.write('debug', message, context);
  }

  public static info(message: string, context?: Record<string, any>): void {
    this.write('info', message, context);
  }

  public static notice(message: string, context?: Record<string, any>): void {
    this.write('notice', message, context);
  }

  public static warning(message: string, context?: Record<string, any>): void {
    this.write('warning', message, context);
  }

  public static error(message: string, context?: Record<string, any>): void {
    this.write('error', message, context);
  }

  public static critical(message: string, context?: Record<string, any>): void {
    this.write('critical', message, context);
  }

  public static alert(message: string, context?: Record<string, any>): void {
    this.write('alert', message, context);
  }

  public static emergency(message: string, context?: Record<string, any>): void {
    this.write('emergency', message, context);
  }
}
