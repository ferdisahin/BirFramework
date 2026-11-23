import http from 'node:http';
import type { Application } from '../core/application.js';
import { TestResponse } from './test-response.js';

export interface RequestOptions {
  headers?: Record<string, string>;
  redirect?: 'follow' | 'manual' | 'error';
}

export class TestClient {
  private server: http.Server | null = null;
  private port: number = 0;
  private defaultHeaders: Record<string, string> = {};
  private cookies: Map<string, string> = new Map();

  constructor(private app: Application) {}

  private async ensureServer(): Promise<string> {
    if (!this.server) {
      this.server = http.createServer((req, res) => this.app.handle(req, res));
      await new Promise<void>((resolve) => {
        this.server!.listen(0, '127.0.0.1', () => {
          const address = this.server!.address();
          if (address && typeof address === 'object') {
            this.port = address.port;
          }
          resolve();
        });
      });
    }
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * Close the ephemeral test server.
   */
  public async close(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          this.server = null;
          resolve();
        });
      });
    }
  }

  /**
   * Set default headers for subsequent requests.
   */
  public withHeaders(headers: Record<string, string>): this {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
    return this;
  }

  /**
   * Simulate a logged-in user.
   */
  public actingAs(user: { id: number | string; [key: string]: any }): this {
    // We can set a simulated user header or session
    this.withHeaders({ 'X-Bir-Test-User': String(user.id) });
    return this;
  }

  private buildCookieHeader(): string {
    const list: string[] = [];
    for (const [k, v] of this.cookies.entries()) {
      list.push(`${k}=${v}`);
    }
    return list.join('; ');
  }

  private updateCookies(response: Response): void {
    const rawCookies: string[] = typeof (response.headers as any).getSetCookie === 'function'
      ? (response.headers as any).getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean) as string[];

    for (const setCookie of rawCookies) {
      if (!setCookie) continue;
      const parts = setCookie.split(';');
      const [nameVal] = parts;
      if (nameVal && nameVal.includes('=')) {
        const [k, v] = nameVal.split('=');
        if (k && v) {
          this.cookies.set(k.trim(), v.trim());
        }
      }
    }
  }

  public async request(
    method: string,
    path: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<TestResponse> {
    const baseUrl = await this.ensureServer();
    const url = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...options.headers,
    };

    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    let payload: any = undefined;
    if (body !== undefined && body !== null) {
      if (typeof body === 'object' && !(body instanceof Buffer)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        payload = JSON.stringify(body);
      } else {
        payload = body;
      }
    }

    const res = await fetch(url, {
      method,
      headers,
      body: payload,
      redirect: options.redirect || 'manual',
    });

    this.updateCookies(res);
    const text = await res.text();
    return new TestResponse(res.status, res.headers, text);
  }

  public async get(path: string, options?: RequestOptions): Promise<TestResponse> {
    return this.request('GET', path, undefined, options);
  }

  public async post(path: string, body?: any, options?: RequestOptions): Promise<TestResponse> {
    return this.request('POST', path, body, options);
  }

  public async put(path: string, body?: any, options?: RequestOptions): Promise<TestResponse> {
    return this.request('PUT', path, body, options);
  }

  public async patch(path: string, body?: any, options?: RequestOptions): Promise<TestResponse> {
    return this.request('PATCH', path, body, options);
  }

  public async delete(path: string, options?: RequestOptions): Promise<TestResponse> {
    return this.request('DELETE', path, undefined, options);
  }
}

/**
 * Factory helper to create a test client from an Application instance.
 */
export function createTestClient(app: Application): TestClient {
  return new TestClient(app);
}
