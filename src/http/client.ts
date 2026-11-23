import assert from 'node:assert';

export class HttpRequestException extends Error {
  constructor(
    public readonly response: HttpResponse,
    message?: string
  ) {
    super(message || `HTTP request returned status code ${response.status}: ${response.statusText}`);
    this.name = 'HttpRequestException';
  }
}

export class HttpResponse {
  private _json: any = undefined;

  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly headers: Record<string, string>,
    public readonly body: string
  ) {}

  public get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  public successful(): boolean {
    return this.ok;
  }

  public redirect(): boolean {
    return this.status >= 300 && this.status < 400;
  }

  public failed(): boolean {
    return this.status >= 400;
  }

  public clientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  public serverError(): boolean {
    return this.status >= 500;
  }

  public text(): string {
    return this.body;
  }

  public json<T = any>(key?: string, defaultValue?: any): T {
    if (this._json === undefined) {
      if (!this.body) {
        this._json = null;
      } else {
        try {
          this._json = JSON.parse(this.body);
        } catch {
          this._json = null;
        }
      }
    }

    if (!key) {
      return this._json as T;
    }

    const segments = key.split('.');
    let cur = this._json;
    for (const segment of segments) {
      if (cur === null || cur === undefined || typeof cur !== 'object') {
        return defaultValue as T;
      }
      cur = cur[segment];
    }
    return (cur !== undefined ? cur : defaultValue) as T;
  }

  public header(name: string): string | undefined {
    const target = name.toLowerCase();
    for (const [k, v] of Object.entries(this.headers)) {
      if (k.toLowerCase() === target) {
        return v;
      }
    }
    return undefined;
  }

  public throw(): this {
    if (this.failed()) {
      throw new HttpRequestException(this);
    }
    return this;
  }
}

export class HttpRequest {
  constructor(
    public readonly url: string,
    public readonly method: string,
    public readonly headers: Record<string, string>,
    public readonly data?: any
  ) {}

  public hasHeader(name: string, value?: string): boolean {
    const target = name.toLowerCase();
    for (const [k, v] of Object.entries(this.headers)) {
      if (k.toLowerCase() === target) {
        if (value !== undefined) {
          return v === value;
        }
        return true;
      }
    }
    return false;
  }

  public header(name: string): string | undefined {
    const target = name.toLowerCase();
    for (const [k, v] of Object.entries(this.headers)) {
      if (k.toLowerCase() === target) {
        return v;
      }
    }
    return undefined;
  }

  public isJson(): boolean {
    const contentType = this.header('content-type') || '';
    return contentType.includes('application/json');
  }

  public body(): any {
    return this.data;
  }

  public json(): any {
    if (typeof this.data === 'string') {
      try {
        return JSON.parse(this.data);
      } catch {
        return null;
      }
    }
    return this.data;
  }
}

export type FakeCallback = (request: HttpRequest) => HttpResponse | Promise<HttpResponse> | any;
export type FakeStubs = Record<string, any | HttpResponse> | FakeCallback;

export class PendingRequest {
  private _baseUrl: string = '';
  private _headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  private _bodyType: 'json' | 'form' = 'json';
  private _timeoutMs: number = 30000;
  private _retryTimes: number = 0;
  private _retryDelayMs: number = 0;
  private _retryWhen?: (errorOrRes: any) => boolean;

  public baseUrl(url: string): this {
    this._baseUrl = url.replace(/\/+$/, '');
    return this;
  }

  public withHeaders(headers: Record<string, string>): this {
    Object.assign(this._headers, headers);
    return this;
  }

  public withToken(token: string, type: string = 'Bearer'): this {
    this._headers['Authorization'] = `${type} ${token}`;
    return this;
  }

  public withBasicAuth(username: string, password: string): this {
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    this._headers['Authorization'] = `Basic ${encoded}`;
    return this;
  }

  public asJson(): this {
    this._bodyType = 'json';
    this._headers['Content-Type'] = 'application/json';
    return this;
  }

  public asForm(): this {
    this._bodyType = 'form';
    this._headers['Content-Type'] = 'application/x-www-form-urlencoded';
    return this;
  }

  public accept(contentType: string): this {
    this._headers['Accept'] = contentType;
    return this;
  }

  public acceptJson(): this {
    return this.accept('application/json');
  }

  public timeout(ms: number): this {
    this._timeoutMs = ms;
    return this;
  }

  public retry(times: number, delayMs: number = 0, when?: (errorOrRes: any) => boolean): this {
    this._retryTimes = times;
    this._retryDelayMs = delayMs;
    this._retryWhen = when;
    return this;
  }

  private resolveUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return `${this._baseUrl}${cleanUrl}`;
  }

  public async get(url: string, query?: Record<string, any>): Promise<HttpResponse> {
    return this.send('GET', url, undefined, query);
  }

  public async post(url: string, data?: any): Promise<HttpResponse> {
    return this.send('POST', url, data);
  }

  public async put(url: string, data?: any): Promise<HttpResponse> {
    return this.send('PUT', url, data);
  }

  public async patch(url: string, data?: any): Promise<HttpResponse> {
    return this.send('PATCH', url, data);
  }

  public async delete(url: string, data?: any): Promise<HttpResponse> {
    return this.send('DELETE', url, data);
  }

  public async head(url: string, query?: Record<string, any>): Promise<HttpResponse> {
    return this.send('HEAD', url, undefined, query);
  }

  public async send(method: string, url: string, data?: any, query?: Record<string, any>): Promise<HttpResponse> {
    let targetUrl = this.resolveUrl(url);

    if (query && Object.keys(query).length > 0) {
      const parsedUrl = new URL(targetUrl);
      for (const [key, val] of Object.entries(query)) {
        if (val !== undefined && val !== null) {
          parsedUrl.searchParams.set(key, String(val));
        }
      }
      targetUrl = parsedUrl.toString();
    }

    const headers = { ...this._headers };
    let bodyPayload: any = undefined;

    if (data !== undefined && method !== 'GET' && method !== 'HEAD') {
      if (this._bodyType === 'json') {
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
        bodyPayload = typeof data === 'string' ? data : JSON.stringify(data);
      } else if (this._bodyType === 'form') {
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        if (typeof data === 'string') {
          bodyPayload = data;
        } else {
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(data)) {
            params.set(k, String(v));
          }
          bodyPayload = params.toString();
        }
      } else {
        bodyPayload = data;
      }
    }

    const httpRequest = new HttpRequest(targetUrl, method.toUpperCase(), headers, data);

    // Check if fakes are enabled
    if (Http.isFaking()) {
      return Http.handleFake(httpRequest);
    }

    // Real HTTP execution with retry logic
    let attempts = 0;
    const maxAttempts = this._retryTimes + 1;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const controller = new AbortController();
        const timeoutTimer = setTimeout(() => controller.abort(), this._timeoutMs);

        const res = await fetch(targetUrl, {
          method: method.toUpperCase(),
          headers,
          body: bodyPayload,
          signal: controller.signal,
        });

        clearTimeout(timeoutTimer);

        const resHeaders: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          resHeaders[key] = value;
        });

        const rawBody = await res.text();
        const response = new HttpResponse(res.status, res.statusText, resHeaders, rawBody);

        if (attempts < maxAttempts) {
          const shouldRetry = this._retryWhen ? this._retryWhen(response) : response.serverError();
          if (shouldRetry) {
            if (this._retryDelayMs > 0) {
              await new Promise((r) => setTimeout(r, this._retryDelayMs));
            }
            continue;
          }
        }

        return response;
      } catch (err: any) {
        if (attempts < maxAttempts) {
          const shouldRetry = this._retryWhen ? this._retryWhen(err) : true;
          if (shouldRetry) {
            if (this._retryDelayMs > 0) {
              await new Promise((r) => setTimeout(r, this._retryDelayMs));
            }
            continue;
          }
        }
        throw err;
      }
    }

    throw new Error(`[BirHttp] Request failed after ${maxAttempts} attempts`);
  }
}

export class Http {
  private static _faking: boolean = false;
  private static _stubs: FakeStubs | null = null;
  private static _recorded: HttpRequest[] = [];

  public static isFaking(): boolean {
    return this._faking;
  }

  public static fake(stubs?: FakeStubs): void {
    this._faking = true;
    this._stubs = stubs ?? null;
    this._recorded = [];
  }

  public static resetFakes(): void {
    this._faking = false;
    this._stubs = null;
    this._recorded = [];
  }

  public static recorded(): HttpRequest[] {
    return [...this._recorded];
  }

  public static response(body: any = {}, status: number = 200, headers: Record<string, string> = {}): HttpResponse {
    const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
    const normalizedHeaders = {
      'content-type': typeof body === 'object' ? 'application/json' : 'text/plain',
      ...headers,
    };
    return new HttpResponse(status, status >= 200 && status < 300 ? 'OK' : 'Error', normalizedHeaders, rawBody);
  }

  public static async handleFake(request: HttpRequest): Promise<HttpResponse> {
    this._recorded.push(request);

    if (typeof this._stubs === 'function') {
      const result = await this._stubs(request);
      if (result instanceof HttpResponse) {
        return result;
      }
      return this.response(result);
    }

    if (this._stubs && typeof this._stubs === 'object') {
      for (const [pattern, stub] of Object.entries(this._stubs)) {
        if (this.matchesPattern(request.url, pattern)) {
          if (typeof stub === 'function') {
            const res = await stub(request);
            return res instanceof HttpResponse ? res : this.response(res);
          }
          if (stub instanceof HttpResponse) {
            return stub;
          }
          return this.response(stub);
        }
      }
    }

    // Default response when faking without matching pattern
    return this.response({}, 200);
  }

  private static matchesPattern(url: string, pattern: string): boolean {
    if (pattern === '*' || pattern === url) {
      return true;
    }
    const regexPattern = '^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
    return new RegExp(regexPattern).test(url);
  }

  public static assertSent(callback: (request: HttpRequest) => boolean | void): void {
    assert.ok(this._faking, '[BirHttp] Http.fake() must be enabled to run assertions.');
    const match = this._recorded.some((req) => {
      try {
        const res = callback(req);
        return res === undefined || res === true;
      } catch {
        return false;
      }
    });

    if (!match) {
      assert.fail(`[BirHttp] An expected request was not sent. Recorded ${this._recorded.length} request(s).`);
    }
  }

  public static assertNotSent(callback: (request: HttpRequest) => boolean | void): void {
    assert.ok(this._faking, '[BirHttp] Http.fake() must be enabled to run assertions.');
    const match = this._recorded.some((req) => {
      try {
        const res = callback(req);
        return res === undefined || res === true;
      } catch {
        return false;
      }
    });

    if (match) {
      assert.fail(`[BirHttp] An unexpected request was sent.`);
    }
  }

  public static assertSentCount(expected: number): void {
    assert.ok(this._faking, '[BirHttp] Http.fake() must be enabled to run assertions.');
    assert.strictEqual(
      this._recorded.length,
      expected,
      `[BirHttp] Expected ${expected} requests to be sent, but ${this._recorded.length} were recorded.`
    );
  }

  public static assertNothingSent(): void {
    this.assertSentCount(0);
  }

  // Builder factory methods
  public static baseUrl(url: string): PendingRequest {
    return new PendingRequest().baseUrl(url);
  }

  public static withHeaders(headers: Record<string, string>): PendingRequest {
    return new PendingRequest().withHeaders(headers);
  }

  public static withToken(token: string, type: string = 'Bearer'): PendingRequest {
    return new PendingRequest().withToken(token, type);
  }

  public static withBasicAuth(username: string, password: string): PendingRequest {
    return new PendingRequest().withBasicAuth(username, password);
  }

  public static asJson(): PendingRequest {
    return new PendingRequest().asJson();
  }

  public static asForm(): PendingRequest {
    return new PendingRequest().asForm();
  }

  public static accept(contentType: string): PendingRequest {
    return new PendingRequest().accept(contentType);
  }

  public static acceptJson(): PendingRequest {
    return new PendingRequest().acceptJson();
  }

  public static timeout(ms: number): PendingRequest {
    return new PendingRequest().timeout(ms);
  }

  public static retry(times: number, delayMs: number = 0, when?: (errorOrRes: any) => boolean): PendingRequest {
    return new PendingRequest().retry(times, delayMs, when);
  }

  public static async get(url: string, query?: Record<string, any>): Promise<HttpResponse> {
    return new PendingRequest().get(url, query);
  }

  public static async post(url: string, data?: any): Promise<HttpResponse> {
    return new PendingRequest().post(url, data);
  }

  public static async put(url: string, data?: any): Promise<HttpResponse> {
    return new PendingRequest().put(url, data);
  }

  public static async patch(url: string, data?: any): Promise<HttpResponse> {
    return new PendingRequest().patch(url, data);
  }

  public static async delete(url: string, data?: any): Promise<HttpResponse> {
    return new PendingRequest().delete(url, data);
  }

  public static async head(url: string, query?: Record<string, any>): Promise<HttpResponse> {
    return new PendingRequest().head(url, query);
  }

  public static async send(method: string, url: string, data?: any): Promise<HttpResponse> {
    return new PendingRequest().send(method, url, data);
  }
}
