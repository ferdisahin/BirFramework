import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context } from '../http/context.js';
import type { Middleware } from '../router/middleware.js';

export interface SessionOptions {
  secret?: string;
  cookieName?: string;
  maxAge?: number; // seconds
  secure?: boolean;
  maxSessions?: number; // max in-memory sessions before LRU eviction
}

export class Session {
  public id: string;
  private data: Record<string, any> = {};
  private flashData: Record<string, any> = {};
  public isNew: boolean = false;
  public createdAt: number;
  public lastActivity: number;

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

  public isDirty(): boolean {
    return Object.keys(this.data).length > 0 || Object.keys(this.flashData).length > 0;
  }

  public regenerate(): string {
    const oldId = this.id;
    const newId = randomBytes(16).toString('hex');
    this.id = newId;
    this.touch();

    sessionStore.delete(oldId);
    sessionStore.set(newId, this);

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
export const DEFAULT_MAX_SESSIONS = 50000;

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

export function saveSession(session: Session, maxAgeSeconds: number, maxSessions = DEFAULT_MAX_SESSIONS): void {
  if (!sessionStore.has(session.id) && sessionStore.size >= maxSessions) {
    sweepExpiredSessions(maxAgeSeconds);
    if (sessionStore.size >= maxSessions) {
      // Evict oldest session (first key in map)
      const oldestKey = sessionStore.keys().next().value;
      if (oldestKey) {
        sessionStore.delete(oldestKey);
      }
    }
  }
  sessionStore.set(session.id, session);
}

let ephemeralProductionKey: string | null = null;
let ephemeralKeyWarned = false;

function getEphemeralProductionKey(): string {
  if (!ephemeralProductionKey) {
    ephemeralProductionKey = randomBytes(32).toString('hex');
  }
  if (!ephemeralKeyWarned) {
    ephemeralKeyWarned = true;
    console.warn(
      '\x1b[33m[BirSecurity] WARNING: APP_KEY is not set in production. A temporary runtime-generated secret is being used. Sessions will invalidate across serverless cold starts or restarts. Please configure APP_KEY in your environment variables.\x1b[0m'
    );
  }
  return ephemeralProductionKey;
}

export class CookieManager {
  private secret: string;
  public readonly isEphemeral: boolean = false;

  constructor(secret?: string) {
    const candidate = secret || process.env.APP_KEY;
    if (!candidate) {
      if (process.env.NODE_ENV === 'production') {
        this.secret = getEphemeralProductionKey();
        this.isEphemeral = true;
      } else {
        this.secret = 'bir-framework-dev-fallback-key-32-chars-min';
      }
    } else {
      this.secret = candidate;
    }
  }

  public parse(header: string = ''): Record<string, string> {
    const cookies: Record<string, string> = {};
    const pairs = header.split(';');

    for (const pair of pairs) {
      const [rawName, ...rest] = pair.trim().split('=');
      const name = rawName?.trim();
      if (name && name !== '__proto__' && name !== 'constructor' && name !== 'prototype') {
        try {
          cookies[name] = decodeURIComponent(rest.join('=').trim());
        } catch {
          cookies[name] = rest.join('=').trim();
        }
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

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
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

let _defaultCookieManager: CookieManager | null = null;
export function getDefaultCookieManager(): CookieManager {
  if (!_defaultCookieManager) {
    _defaultCookieManager = new CookieManager();
  }
  return _defaultCookieManager;
}

export const cookieManager: CookieManager = new Proxy({} as CookieManager, {
  get(_target, prop, receiver) {
    return Reflect.get(getDefaultCookieManager(), prop, receiver);
  }
});

let lastSweepTime = Date.now();

/**
 * Session Middleware: attaches `ctx.session` to every request and sets signed session cookie.
 */
export function sessionMiddleware(options: SessionOptions = {}): Middleware {
  const cookieName = options.cookieName || 'bir_session';
  const maxAge = options.maxAge || 86400 * 7; // 7 days
  const maxSessions = options.maxSessions || DEFAULT_MAX_SESSIONS;
  const manager = options.secret ? new CookieManager(options.secret) : getDefaultCookieManager();

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

    const initialSessionId = sessionId;
    let session: Session;
    let isExisting = false;

    if (sessionId && sessionStore.has(sessionId)) {
      session = sessionStore.get(sessionId)!;
      // Server-side expiration check
      if (session.isExpired(maxAge)) {
        sessionStore.delete(sessionId);
        session = new Session();
      } else {
        session.touch();
        isExisting = true;
      }
    } else {
      session = new Session();
    }

    // Attach to context
    (ctx as any).session = session;

    // Secure flag: true in production, or when requested over HTTPS, or explicitly enabled in options
    const isHttps =
      ctx.req.headers['x-forwarded-proto'] === 'https' ||
      (ctx.req.socket as any)?.encrypted === true;
    const isProduction = process.env.NODE_ENV === 'production';
    const secure = options.secure !== undefined ? options.secure : (isProduction || isHttps);

    let cookieWritten = false;
    // Request-scoped cookie writer: strictly writes to THIS request's response
    const writeSessionCookie = (idToSign: string) => {
      if (cookieWritten) return;
      if (!ctx.res.headersSent && !ctx.res.writableEnded) {
        cookieWritten = true;
        const signedVal = manager.sign(idToSign);
        const cookieHeader = manager.serialize(cookieName, signedVal, {
          maxAge,
          httpOnly: true,
          sameSite: 'Lax',
          secure,
        });
        ctx.header('Set-Cookie', cookieHeader);
      }
    };

    if (isExisting) {
      writeSessionCookie(session.id);
    }

    // Expose callback on ctx for Auth.login / regenerate
    (ctx as any)._applySessionCookie = (idToSign: string = session.id) => {
      saveSession(session, maxAge, maxSessions);
      writeSessionCookie(idToSign);
    };

    // Intercept writeHead and end so dirty/new sessions write Set-Cookie BEFORE headers go out
    const origWriteHead = ctx.res.writeHead.bind(ctx.res);
    ctx.res.writeHead = function (statusCode: number, ...args: any[]) {
      const sessionChanged = (initialSessionId && session.id !== initialSessionId) || Boolean((ctx as any)._sessionNeedsCookie);
      if (session.isDirty() || sessionChanged) {
        saveSession(session, maxAge, maxSessions);
        writeSessionCookie(session.id);
      }
      return (origWriteHead as any)(statusCode, ...args);
    };

    const origEnd = ctx.res.end.bind(ctx.res);
    ctx.res.end = function (...args: any[]) {
      const sessionChanged = (initialSessionId && session.id !== initialSessionId) || Boolean((ctx as any)._sessionNeedsCookie);
      if (session.isDirty() || sessionChanged) {
        saveSession(session, maxAge, maxSessions);
        writeSessionCookie(session.id);
      }
      return (origEnd as any)(...args);
    };

    await next();

    // After handler finishes:
    // If session ID changed (Auth.login / session.regenerate) or data was written:
    const sessionChanged = (initialSessionId && session.id !== initialSessionId) || Boolean((ctx as any)._sessionNeedsCookie);
    if (session.isDirty() || sessionChanged) {
      saveSession(session, maxAge, maxSessions);
      writeSessionCookie(session.id);
    }
  };
}
