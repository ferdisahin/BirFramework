import { createHmac, randomBytes } from 'node:crypto';
import type { Context } from '../http/context.js';
import type { Middleware } from '../router/middleware.js';

export interface SessionOptions {
  secret?: string;
  cookieName?: string;
  maxAge?: number; // seconds
}

export class Session {
  public id: string;
  private data: Record<string, any> = {};
  private flashData: Record<string, any> = {};
  private isNew: boolean = false;

  constructor(id?: string, initialData: Record<string, any> = {}) {
    this.id = id || randomBytes(16).toString('hex');
    this.data = { ...initialData };
    this.isNew = !id;
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
    return this;
  }

  public flash(key: string, value: any): this {
    this.flashData[key] = value;
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
  }

  public clear(): void {
    this.data = {};
    this.flashData = {};
  }

  public toJSON(): Record<string, any> {
    return { ...this.data };
  }
}

// In-memory session store (can be extended to Redis/SQLite)
export const sessionStore = new Map<string, Session>();

export class CookieManager {
  private secret: string;

  constructor(secret: string = process.env.APP_KEY || 'bir-framework-secret-key-32-chars-min') {
    this.secret = secret;
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

/**
 * Session Middleware: attaches `ctx.session` to every request and sets signed session cookie.
 */
export function sessionMiddleware(options: SessionOptions = {}): Middleware {
  const cookieName = options.cookieName || 'bir_session';
  const maxAge = options.maxAge || 86400 * 7; // 7 days

  return async (ctx: Context, next) => {
    const rawCookieHeader = ctx.req.headers.cookie || '';
    const cookies = cookieManager.parse(rawCookieHeader);
    const signedSessionId = cookies[cookieName];

    let sessionId: string | null = null;
    if (signedSessionId) {
      sessionId = cookieManager.unsign(signedSessionId);
    }

    let session: Session;
    if (sessionId && sessionStore.has(sessionId)) {
      session = sessionStore.get(sessionId)!;
    } else {
      session = new Session();
      sessionStore.set(session.id, session);
    }

    // Attach to context
    (ctx as any).session = session;

    // Set signed cookie on response
    const signedVal = cookieManager.sign(session.id);
    const cookieHeader = cookieManager.serialize(cookieName, signedVal, {
      maxAge,
      httpOnly: true,
      sameSite: 'Lax',
    });
    ctx.header('Set-Cookie', cookieHeader);

    await next();
  };
}
