import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Context } from '../http/context.js';
import type { Middleware } from '../router/middleware.js';
import { dbConnection } from '../database/connection.js';

export interface SessionOptions {
  secret?: string;
  cookieName?: string;
  maxAge?: number; // seconds
  secure?: boolean;
  maxSessions?: number; // max in-memory sessions before LRU eviction
  driver?: 'memory' | 'file' | 'database';
  storeDir?: string;
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

  public serialize(): string {
    return JSON.stringify({
      id: this.id,
      data: this.data,
      flashData: this.flashData,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
    });
  }

  public static deserialize(raw: string): Session | null {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.id !== 'string') return null;
      const s = new Session(parsed.id, parsed.data || {});
      if (parsed.flashData && typeof parsed.flashData === 'object') {
        for (const [k, v] of Object.entries(parsed.flashData)) {
          s.flash(k, v);
        }
      }
      if (typeof parsed.createdAt === 'number') s.createdAt = parsed.createdAt;
      if (typeof parsed.lastActivity === 'number') s.lastActivity = parsed.lastActivity;
      return s;
    } catch {
      return null;
    }
  }
}

export interface SessionStoreDriver {
  get(id: string): Promise<Session | null> | Session | null;
  set(session: Session, maxAgeSeconds: number): Promise<void> | void;
  delete(id: string): Promise<void> | void;
  sweep?(maxAgeSeconds: number): Promise<number> | number;
}

export class FileSessionStore implements SessionStoreDriver {
  private dir: string;

  constructor(dir: string = resolve(process.cwd(), 'storage/framework/sessions')) {
    this.dir = resolve(dir);
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  private getFilePath(id: string): string | null {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
    return join(this.dir, `${id}.json`);
  }

  public get(id: string): Session | null {
    const file = this.getFilePath(id);
    if (!file || !existsSync(file)) return null;
    try {
      return Session.deserialize(readFileSync(file, 'utf-8'));
    } catch {
      return null;
    }
  }

  public set(session: Session): void {
    const file = this.getFilePath(session.id);
    if (!file) return;
    writeFileSync(file, session.serialize(), 'utf-8');
  }

  public delete(id: string): void {
    const file = this.getFilePath(id);
    if (file && existsSync(file)) {
      rmSync(file, { force: true });
    }
  }

  public sweep(maxAgeSeconds: number): number {
    if (!existsSync(this.dir)) return 0;
    let count = 0;
    for (const entry of readdirSync(this.dir)) {
      if (!entry.endsWith('.json')) continue;
      const fullPath = join(this.dir, entry);
      try {
        const s = Session.deserialize(readFileSync(fullPath, 'utf-8'));
        if (!s || s.isExpired(maxAgeSeconds)) {
          rmSync(fullPath, { force: true });
          count++;
        }
      } catch {
        rmSync(fullPath, { force: true });
        count++;
      }
    }
    return count;
  }
}

export class DatabaseSessionStore implements SessionStoreDriver {
  private tableEnsured = false;

  public async ensureTable(): Promise<void> {
    if (this.tableEnsured) return;
    const isPg = dbConnection.dialect === 'postgres';
    const q = isPg ? '"' : '`';
    const textType = dbConnection.dialect === 'sqlite' ? 'TEXT' : 'VARCHAR(255)';
    await dbConnection.exec(`
      CREATE TABLE IF NOT EXISTS ${q}_sessions${q} (
        ${q}id${q} ${textType} PRIMARY KEY,
        ${q}payload${q} TEXT NOT NULL,
        ${q}last_activity${q} INTEGER NOT NULL
      );
    `);
    this.tableEnsured = true;
  }

  public async get(id: string): Promise<Session | null> {
    await this.ensureTable();
    const q = dbConnection.dialect === 'postgres' ? '"' : '`';
    const rows = await dbConnection.query<{ payload: string }>(
      `SELECT ${q}payload${q} FROM ${q}_sessions${q} WHERE ${q}id${q} = ? LIMIT 1;`,
      [id]
    );
    if (!rows || rows.length === 0) return null;
    return Session.deserialize(rows[0]!.payload);
  }

  public async set(session: Session): Promise<void> {
    await this.ensureTable();
    const q = dbConnection.dialect === 'postgres' ? '"' : '`';
    const lastAct = Math.floor(session.lastActivity / 1000);
    const payload = session.serialize();

    const update = dbConnection.dialect === 'mysql'
      ? `ON DUPLICATE KEY UPDATE ${q}payload${q} = ?, ${q}last_activity${q} = ?`
      : `ON CONFLICT (${q}id${q}) DO UPDATE SET ${q}payload${q} = ?, ${q}last_activity${q} = ?`;

    await dbConnection.execute(
      `INSERT INTO ${q}_sessions${q} (${q}id${q}, ${q}payload${q}, ${q}last_activity${q}) VALUES (?, ?, ?) ${update}`,
      [session.id, payload, lastAct, payload, lastAct]
    );
  }

  public async delete(id: string): Promise<void> {
    await this.ensureTable();
    const q = dbConnection.dialect === 'postgres' ? '"' : '`';
    await dbConnection.execute(`DELETE FROM ${q}_sessions${q} WHERE ${q}id${q} = ?;`, [id]);
  }

  public async sweep(maxAgeSeconds: number): Promise<number> {
    await this.ensureTable();
    const q = dbConnection.dialect === 'postgres' ? '"' : '`';
    const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;
    const res = await dbConnection.execute(
      `DELETE FROM ${q}_sessions${q} WHERE ${q}last_activity${q} < ?;`,
      [cutoff]
    );
    return Number(res.changes);
  }
}

let activeStoreDriver: SessionStoreDriver | null = null;

export function setSessionStore(driver: SessionStoreDriver | null): void {
  activeStoreDriver = driver;
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

export function saveSession(session: Session, maxAgeSeconds: number, maxSessions = DEFAULT_MAX_SESSIONS, driver: SessionStoreDriver | null = activeStoreDriver): void {
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
  if (driver) {
    void Promise.resolve(driver.set(session, maxAgeSeconds)).catch(() => {});
  }
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

  const driver: SessionStoreDriver | null =
    options.driver === 'file'
      ? new FileSessionStore(options.storeDir)
      : options.driver === 'database'
      ? new DatabaseSessionStore()
      : options.driver === 'memory'
      ? null
      : activeStoreDriver;

  return async (ctx: Context, next) => {
    // Periodically sweep expired sessions from memory (every 10 minutes)
    if (Date.now() - lastSweepTime > 600000) {
      lastSweepTime = Date.now();
      sweepExpiredSessions(maxAge);
      if (driver?.sweep) {
        void Promise.resolve(driver.sweep(maxAge)).catch(() => {});
      }
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

    let loaded: Session | null | undefined = sessionId ? sessionStore.get(sessionId) : undefined;
    if (!loaded && sessionId && driver) {
      loaded = await driver.get(sessionId);
      if (loaded) {
        sessionStore.set(loaded.id, loaded);
      }
    }

    if (sessionId && loaded) {
      session = loaded;
      // Server-side expiration check
      if (session.isExpired(maxAge)) {
        sessionStore.delete(sessionId);
        if (driver) await driver.delete(sessionId);
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
      saveSession(session, maxAge, maxSessions, driver);
      writeSessionCookie(idToSign);
    };

    // Intercept writeHead and end so dirty/new sessions write Set-Cookie BEFORE headers go out
    const origWriteHead = ctx.res.writeHead.bind(ctx.res);
    ctx.res.writeHead = function (statusCode: number, ...args: any[]) {
      const sessionChanged = (initialSessionId && session.id !== initialSessionId) || Boolean((ctx as any)._sessionNeedsCookie);
      if (session.isDirty() || sessionChanged) {
        saveSession(session, maxAge, maxSessions, driver);
        writeSessionCookie(session.id);
      }
      return (origWriteHead as any)(statusCode, ...args);
    };

    const origEnd = ctx.res.end.bind(ctx.res);
    ctx.res.end = function (...args: any[]) {
      const sessionChanged = (initialSessionId && session.id !== initialSessionId) || Boolean((ctx as any)._sessionNeedsCookie);
      if (session.isDirty() || sessionChanged) {
        saveSession(session, maxAge, maxSessions, driver);
        writeSessionCookie(session.id);
      }
      return (origEnd as any)(...args);
    };

    await next();

    // After handler finishes:
    // If session ID changed (Auth.login / session.regenerate) or data was written:
    const sessionChanged = (initialSessionId && session.id !== initialSessionId) || Boolean((ctx as any)._sessionNeedsCookie);
    if (session.isDirty() || sessionChanged) {
      saveSession(session, maxAge, maxSessions, driver);
      writeSessionCookie(session.id);
    }
  };
}
