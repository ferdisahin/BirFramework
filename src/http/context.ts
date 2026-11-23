import type { IncomingMessage, ServerResponse } from 'node:http';
import { defaultViewEngine, type ViewEngine } from '../view/engine.js';
import type { Session } from '../auth/session.js';
import { Validator, type ValidationRules, type FormRequest } from '../validation/index.js';
import { UploadedFile } from './uploaded-file.js';
import { parseMultipart } from './multipart.js';
import { __, Lang } from '../localization/translator.js';

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
  private _files: Record<string, UploadedFile[]> = {};
  private _rawBodyBuffer: Buffer | null = null;
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

  public get locale(): string {
    return (
      (this.query['lang'] as string) ||
      (this.req.headers['x-locale'] as string) ||
      Lang.getLocale()
    );
  }

  public __(key: string, replace: Record<string, any> = {}, locale?: string): string {
    return __(key, replace, locale || this.locale);
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
    const rawBuffer = await this.readRawBodyBuffer();

    if (!rawBuffer || rawBuffer.length === 0) {
      this._bodyParsed = true;
      this._cachedBody = null;
      return null as unknown as T;
    }

    if (contentType.includes('multipart/form-data')) {
      const boundaryMatch = contentType.match(/boundary=(?:["']?)([^"';]+)(?:["']?)/);
      if (boundaryMatch && boundaryMatch[1]) {
        const parsed = parseMultipart(rawBuffer, boundaryMatch[1]);
        this._files = parsed.files;
        this._cachedBody = parsed.fields;
      } else {
        this._cachedBody = {};
      }
    } else if (contentType.includes('application/json')) {
      try {
        this._cachedBody = JSON.parse(rawBuffer.toString('utf-8'));
      } catch (err) {
        throw new Error('Invalid JSON payload');
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const searchParams = new URLSearchParams(rawBuffer.toString('utf-8'));
      const parsed: Record<string, any> = {};
      for (const [key, value] of searchParams.entries()) {
        parsed[key] = value;
      }
      this._cachedBody = parsed;
    } else {
      this._cachedBody = rawBuffer.toString('utf-8');
    }

    this._bodyParsed = true;
    return this._cachedBody as T;
  }

  /**
   * Retrieve a single uploaded file by input field name
   */
  public async file(name: string): Promise<UploadedFile | null> {
    if (!this._bodyParsed) {
      await this.body();
    }
    const list = this._files[name];
    return list && list.length > 0 ? list[0]! : null;
  }

  /**
   * Retrieve all uploaded files, or all files for a specific field name
   */
  public async files(name?: string): Promise<UploadedFile[] | Record<string, UploadedFile[]>> {
    if (!this._bodyParsed) {
      await this.body();
    }
    if (name) {
      return this._files[name] || [];
    }
    return this._files;
  }

  /**
   * Validate incoming request parameters, body and query against validation rules
   */
  public async validate<T = any>(rules: ValidationRules): Promise<T> {
    const body = (await this.body()) || {};
    const data = { ...this.query, ...body, ...this.params };
    return Validator.validate<T>(data, rules);
  }

  /**
   * Validate request using a dedicated FormRequest class
   */
  public async validateWith<R extends FormRequest<any>>(
    RequestClass: new (ctx: Context) => R
  ): Promise<ReturnType<R['validated']>> {
    const requestInstance = new RequestClass(this);
    return requestInstance.validate();
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
   * Redirect to a URL
   */
  public redirect(url: string, statusCode: number = 302): void {
    this.status(statusCode);
    this.header('Location', url);
    this.res.end();
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

  private readRawBodyBuffer(): Promise<Buffer> {
    if (this._rawBodyBuffer) {
      return Promise.resolve(this._rawBodyBuffer);
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.req.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      this.req.on('end', () => {
        this._rawBodyBuffer = Buffer.concat(chunks);
        resolve(this._rawBodyBuffer);
      });
      this.req.on('error', (err) => reject(err));
    });
  }
}
