import type { IncomingMessage, ServerResponse } from 'node:http';
import { defaultViewEngine, type ViewEngine } from '../view/engine.js';
import type { Session } from '../auth/session.js';
import { Validator, type ValidationRules } from '../validation/index.js';

export interface CookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path?: string;
  domain?: string;
}

export class Context {
  public params: Record<string, string> = {};
  public query: Record<string, string | string[]> = {};
  public session?: Session;
  private _bodyParsed: boolean = false;
  private _cachedBody: any = null;
  private _statusCode: number = 200;
  private _headers: Record<string, string | string[]> = {};

  constructor(
    public readonly req: IncomingMessage,
    public readonly res: ServerResponse
  ) {
    this.parseQuery();
  }

  public get method(): string {
    return this.req.method?.toUpperCase() || 'GET';
  }

  public get url(): string {
    return this.req.url || '/';
  }

  public get path(): string {
    const rawUrl = this.req.url || '/';
    const qIndex = rawUrl.indexOf('?');
    return qIndex === -1 ? rawUrl : rawUrl.substring(0, qIndex);
  }

  public get headers() {
    return this.req.headers;
  }

  public header(name: string, value: string | string[]): this {
    this._headers[name.toLowerCase()] = value;
    this.res.setHeader(name, value);
    return this;
  }

  public status(code: number): this {
    this._statusCode = code;
    this.res.statusCode = code;
    return this;
  }

  public async body<T = any>(): Promise<T> {
    if (this._bodyParsed) {
      return this._cachedBody as T;
    }

    const contentType = this.req.headers['content-type'] || '';
    const raw = await this.readRawBody();

    if (!raw || raw.trim().length === 0) {
      this._bodyParsed = true;
      this._cachedBody = null;
      return null as unknown as T;
    }

    if (contentType.includes('application/json')) {
      try {
        this._cachedBody = JSON.parse(raw);
      } catch (err) {
        throw new Error('Invalid JSON payload');
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const searchParams = new URLSearchParams(raw);
      const parsed: Record<string, any> = {};
      for (const [key, value] of searchParams.entries()) {
        parsed[key] = value;
      }
      this._cachedBody = parsed;
    } else {
      this._cachedBody = raw;
    }

    this._bodyParsed = true;
    return this._cachedBody as T;
  }

  /**
   * Validate incoming request parameters, body and query against validation rules
   */
  public async validate<T = any>(rules: ValidationRules): Promise<T> {
    const body = (await this.body()) || {};
    const data = { ...this.query, ...body, ...this.params };
    return Validator.validate<T>(data, rules);
  }

  public json(data: any, statusCode?: number): void {
    if (statusCode) this.status(statusCode);
    this.header('Content-Type', 'application/json; charset=utf-8');
    this.res.end(JSON.stringify(data));
  }

  public text(text: string, statusCode?: number): void {
    if (statusCode) this.status(statusCode);
    this.header('Content-Type', 'text/plain; charset=utf-8');
    this.res.end(text);
  }

  public html(html: string, statusCode?: number): void {
    if (statusCode) this.status(statusCode);
    this.header('Content-Type', 'text/html; charset=utf-8');
    this.res.end(html);
  }

  /**
   * Render a view template with data (views/...)
   */
  public render(templateName: string, data: Record<string, any> = {}, statusCode?: number): void {
    const compiled = defaultViewEngine.render(templateName, data);
    this.html(compiled, statusCode);
  }

  /**
   * AI / LLM Streaming & Realtime SSE support
   */
  public stream(streamFn: (send: (chunk: string) => void) => Promise<void> | void): void {
    this.header('Content-Type', 'text/event-stream');
    this.header('Cache-Control', 'no-cache');
    this.header('Connection', 'keep-alive');
    this.res.flushHeaders?.();

    const send = (chunk: string) => {
      this.res.write(chunk);
    };

    Promise.resolve(streamFn(send))
      .then(() => {
        this.res.end();
      })
      .catch((err) => {
        this.res.write(`data: [ERROR] ${err.message}\n\n`);
        this.res.end();
      });
  }

  private parseQuery(): void {
    const rawUrl = this.req.url || '/';
    const qIndex = rawUrl.indexOf('?');
    if (qIndex === -1) return;

    const queryString = rawUrl.substring(qIndex + 1);
    const searchParams = new URLSearchParams(queryString);
    for (const [key, value] of searchParams.entries()) {
      if (this.query[key] !== undefined) {
        const existing = this.query[key];
        if (Array.isArray(existing)) {
          existing.push(value);
        } else if (typeof existing === 'string') {
          this.query[key] = [existing, value];
        }
      } else {
        this.query[key] = value;
      }
    }
  }

  private readRawBody(): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      this.req.on('data', (chunk) => {
        data += chunk;
      });
      this.req.on('end', () => resolve(data));
      this.req.on('error', (err) => reject(err));
    });
  }
}
