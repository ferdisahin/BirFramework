import type { Middleware } from '../router/middleware.js';
import type { Context } from '../http/context.js';

export interface RateLimitOptions {
  max?: number; // Max requests
  windowMs?: number; // Time window in milliseconds (default 60s)
  message?: string;
  trustProxy?: boolean; // Only trust X-Forwarded-For when explicitly enabled
}

interface ClientRecord {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private records = new Map<string, ClientRecord>();
  private readonly maxRecords: number = 20000;

  public sweepExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, record] of this.records.entries()) {
      if (now > record.resetAt) {
        this.records.delete(key);
        count++;
      }
    }
    return count;
  }

  public check(key: string, max: number = 60, windowMs: number = 60000): { allowed: boolean; remaining: number; resetInSec: number } {
    const now = Date.now();

    // Auto-prune expired records when capacity is reached to prevent memory leaks
    if (this.records.size >= this.maxRecords) {
      this.sweepExpired();
      if (this.records.size >= this.maxRecords) {
        // Evict oldest record
        const oldestKey = this.records.keys().next().value;
        if (oldestKey) this.records.delete(oldestKey);
      }
    }

    const record = this.records.get(key);

    if (!record || now > record.resetAt) {
      this.records.set(key, { count: 1, resetAt: now + windowMs });
      return {
        allowed: true,
        remaining: max - 1,
        resetInSec: Math.ceil(windowMs / 1000),
      };
    }

    record.count++;
    const remaining = Math.max(0, max - record.count);
    const resetInSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));

    return {
      allowed: record.count <= max,
      remaining,
      resetInSec,
    };
  }

  public reset(key: string): void {
    this.records.delete(key);
  }

  public clear(): void {
    this.records.clear();
  }
}

export const rateLimiter = new RateLimiter();

export function rateLimit(options: RateLimitOptions = {}): Middleware {
  const max = options.max || 60;
  const windowMs = options.windowMs || 60000;
  const message = options.message || 'Too Many Requests';
  const trustProxy = options.trustProxy ?? (process.env.TRUST_PROXY === 'true');

  return async (ctx: Context, next) => {
    let ip = ctx.req.socket.remoteAddress || '127.0.0.1';

    if (trustProxy) {
      const forwarded = ctx.headers['x-forwarded-for'];
      if (typeof forwarded === 'string' && forwarded.length > 0) {
        const firstIp = forwarded.split(',')[0]?.trim();
        if (firstIp) {
          ip = firstIp;
        }
      }
    }

    const key = `${ip}:${ctx.path}`;

    const { allowed, remaining, resetInSec } = rateLimiter.check(key, max, windowMs);

    ctx.header('X-RateLimit-Limit', String(max));
    ctx.header('X-RateLimit-Remaining', String(remaining));

    if (!allowed) {
      ctx.header('Retry-After', String(resetInSec));
      return ctx.json({ error: message, retryAfter: resetInSec }, 429);
    }

    await next();
  };
}

/**
 * Laravel-style shorthand rate limiter middleware: throttle(maxAttempts, decayMinutes)
 * Example: Route.get('/api/data', handler).middleware(throttle(60, 1));
 */
export function throttle(maxAttempts: number = 60, decayMinutes: number = 1): Middleware {
  return rateLimit({
    max: maxAttempts,
    windowMs: Math.max(0.01, decayMinutes) * 60 * 1000,
  });
}
