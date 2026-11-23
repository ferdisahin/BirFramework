import { createHmac, randomBytes } from 'node:crypto';
import type { Context } from '../http/context.js';
import type { Middleware } from '../router/middleware.js';

export interface SessionOptions {
  secret?: string;
  cookieName?: string;
  maxAge?: number; // seconds
  secure?: boolean;
}

export class Session {
  public id: string;
  private data: Record<string, any> = {};
  private flashData: Record<string, any> = {};
  public isNew: boolean = false;
  public createdAt: number;
  public lastActivity: number;
  public onRegenerate?: (newId: string) => void;

  constructor(id?: string, initialData: Record<string, any> = {}) {
    this.id = id || randomBytes(16).toString('hex');
    this.data = { ...initialData };
    this.isNew = !id;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  public touch(): void {
    this.lastActivity = Date.now();
  }

  public isExpired(maxAgeSeconds: number): boolean {
    return Date.now() - this.lastActivity > maxAgeSeconds * 1000;
  }

  public regenerate(): string {
    const oldId = this.id;
    const newId = randomBytes(16).toString('hex');
    this.id = newId;
    this.touch();

    sessionStore.delete(oldId);
    sessionStore.set(newId, this);

    if (this.onRegenerate) {
      try {
        this.onRegenerate(newId);
      } catch {
        // ignore if headers already sent
      }
    }

    return newId;
  }

  public get<T = any>(key: string, defaultValue?: T): T {
    if (key in this.flashData) {
      const val = this.flashData[key];
      delete this.flashData[key];
      return val as T;
    }
    return (this.data[key] !== undefined ? this.data[key] : defaultValue) as T;
  }

  public set(key: string, value: any): this {
    this.data[key] = value;
    this.touch();
    return this;
  }

  public flash(key: string, value: any): this {
    this.flashData[key] = value;
    this.touch();
    return this;
  }

  public getFlash<T = any>(key: string, defaultValue?: T): T {
    return this.get<T>(key, defaultValue);
  }

  public has(key: string): boolean {
    return key in this.data || key in this.flashData;
  }

  public remove(key: string): void {
    delete this.data[key];
    delete this.flashData[key];
    this.touch();
  }

  public clear(): void {
    this.data = {};
    this.flashData = {};
    this.touch();
  }

  public toJSON(): Record<string, any> {
    return { ...this.data };
  }
}

// In-memory session store (can be extended to Redis/SQLite)
export const sessionStore = new Map<string, Session>();

export function sweepExpiredSessions(maxAgeSeconds: number): number {
  let count = 0;
  for (const [id, session] of sessionStore.entries()) {
    if (session.isExpired(maxAgeSeconds)) {
      sessionStore.delete(id);
      count++;
    }
  }
  return count;
}

export class CookieManager {
  private secret: string;

  constructor(secret?: string) {
    const candidate = secret || process.env.APP_KEY;
    if (!candidate) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          '[BirSecurity] Production environment requires APP_KEY environment variable or SessionOptions.secret to be configured.'
        );
      }
      this.secret = 'bir-framework-dev-fallback-key-32-chars-min';
    } else {
      this.secret = candidate;
    }
  }

  public parse(header: string = ''): Record<string, string> {
    const cookies: Record<string, string> = {};
    const pairs = header.split(';');

    for (const pair of pairs) {
      const [name, ...rest] = pair.trim().split('=');
      if (name) {
        cookies[name.trim()] = decodeURIComponent(rest.join('=').trim());
      }
    }

    return cookies;
  }

  public sign(value: string): string {
    const signature = createHmac('sha256', this.secret)
      .update(value)
      .digest('base64url');
    return `${value}.${signature}`;
  }

  public unsign(signedValue: string): string | null {
    const lastDot = signedValue.lastIndexOf('.');
    if (lastDot === -1) return null;

    const value = signedValue.substring(0, lastDot);
    const signature = signedValue.substring(lastDot + 1);

    const expectedSignature = createHmac('sha256', this.secret)
      .update(value)
      .digest('base64url');

    if (signature === expectedSignature) {
      return value;
    }

    return null;
  }

  public serialize(name: string, value: string, options: { maxAge?: number; httpOnly?: boolean; path?: string; sameSite?: string; secure?: boolean } = {}): string {
    let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

    cookie += `; Path=${options.path || '/'}`;
    if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`;
    if (options.httpOnly !== false) cookie += '; HttpOnly';
    if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;
    if (options.secure) cookie += '; Secure';

    return cookie;
  }
}

export const cookieManager = new CookieManager();

let lastSweepTime = Date.now();

/**
 * Session Middleware: attaches `ctx.session` to every request and sets signed session cookie.
 */
export function sessionMiddleware(options: SessionOptions = {}): Middleware {
  const cookieName = options.cookieName || 'bir_session';
  const maxAge = options.maxAge || 86400 * 7; // 7 days
  const manager = options.secret ? new CookieManager(options.secret) : cookieManager;

  return async (ctx: Context, next) => {
    // Periodically sweep expired sessions from memory (every 10 minutes)
    if (Date.now() - lastSweepTime > 600000) {
      lastSweepTime = Date.now();
      sweepExpiredSessions(maxAge);
    }

    const rawCookieHeader = ctx.req.headers.cookie || '';
    const cookies = manager.parse(rawCookieHeader);
    const signedSessionId = cookies[cookieName];

    let sessionId: string | null = null;
    if (signedSessionId) {
      sessionId = manager.unsign(signedSessionId);
    }

    let session: Session;
    if (sessionId && sessionStore.has(sessionId)) {
      session = sessionStore.get(sessionId)!;
      // Server-side expiration check
      if (session.isExpired(maxAge)) {
        sessionStore.delete(sessionId);
        session = new Session();
        sessionStore.set(session.id, session);
      } else {
        session.touch();
      }
    } else {
      session = new Session();
      sessionStore.set(session.id, session);
    }

    // Attach to context
    (ctx as any).session = session;

    // Secure flag: true in production, or when requested over HTTPS, or explicitly enabled in options
    const isHttps =
      ctx.req.headers['x-forwarded-proto'] === 'https' ||
      (ctx.req.socket as any)?.encrypted === true;
    const isProduction = process.env.NODE_ENV === 'production';
    const secure = options.secure !== undefined ? options.secure : (isProduction || isHttps);

    const applySessionCookie = () => {
      if (!ctx.res.headersSent && !ctx.res.writableEnded) {
        const signedVal = manager.sign(session.id);
        const cookieHeader = manager.serialize(cookieName, signedVal, {
          maxAge,
          httpOnly: true,
          sameSite: 'Lax',
          secure,
        });
        ctx.header('Set-Cookie', cookieHeader);
      }
    };

    // Attach hook so if session.regenerate() is called in a controller/login, cookie is updated
    session.onRegenerate = () => {
      applySessionCookie();
    };

    // Set signed cookie on response initially
    applySessionCookie();

    await next();

    // Re-apply in case session was regenerated or modified during request handling
    applySessionCookie();
  };
}
