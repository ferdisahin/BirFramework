import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Context } from '../http/context.js';
import { Router, defaultRouter } from '../router/router.js';
import { Container } from '../container/container.js';
import { serveStatic } from '../http/static.js';
import { securityHeaders } from '../http/middlewares.js';
import { sessionMiddleware } from '../auth/session.js';
import { ErrorHandler } from '../errors/handler.js';
import { Broadcast } from '../broadcasting/index.js';
import { ServiceProvider, type Plugin, type ServiceProviderClass } from './provider.js';
import { requestContextStorage } from './request-context.js';
import '../core/env.js';
import type { Middleware } from '../router/middleware.js';

export interface ApplicationOptions {
  router?: Router;
  container?: Container;
}

export class Application {
  public readonly router: Router;
  public readonly container: Container;
  private globalMiddlewares: Middleware[] = [];
  private server: Server | null = null;
  private providers: ServiceProvider[] = [];
  public booted: boolean = false;
  private bootPromise?: Promise<void>;
  private pendingRegistrations: Promise<void>[] = [];

  constructor(options: ApplicationOptions = {}) {
    this.router = options.router || new Router(defaultRouter);
    this.container = options.container || new Container();

    // Register self in container
    this.container.singleton(Application, this);

    // Default static file serving for public directory
    this.use(serveStatic());

    // Default security headers (X-Content-Type-Options, X-Frame-Options, etc.)
    this.use(securityHeaders());

    // Default session middleware
    this.use(sessionMiddleware());
  }

  public use(...middlewares: Middleware[]): this {
    this.globalMiddlewares.push(...middlewares);
    return this;
  }

  /**
   * Register a ServiceProvider class, instance, or plugin function into the application.
   */
  public register(plugin: Plugin, options?: any): this {
    if (typeof plugin === 'function') {
      if (plugin.prototype && plugin.prototype instanceof ServiceProvider) {
        const ProviderClass = plugin as ServiceProviderClass;
        const instance = new ProviderClass(this);
        return this.registerProvider(instance);
      } else {
        // Plugin function: (app, options) => void | Promise<void>
        const result = (plugin as any)(this, options);
        if (result && typeof result.then === 'function') {
          result.catch((err: any) => {
            console.error('[BirFramework] Plugin registration error:', err);
          });
        }
        return this;
      }
    } else if (plugin instanceof ServiceProvider) {
      return this.registerProvider(plugin);
    }

    throw new Error('[BirFramework] Invalid plugin provided to app.register(). Expected a ServiceProvider or Plugin function.');
  }

  private registerProvider(provider: ServiceProvider): this {
    this.providers.push(provider);
    const registration = provider.register();
    if (this.booted) {
      if (registration) {
        void Promise.resolve(registration).then(() => provider.boot()).catch((error) => {
          console.error(`[BirFramework] Provider initialization error in ${provider.constructor.name}:`, error);
        });
      } else {
        const result = provider.boot();
        if (result) void result.catch((error) => console.error(error));
      }
    } else if (registration) {
      const pending = Promise.resolve(registration);
      void pending.catch(() => {});
      this.pendingRegistrations.push(pending);
    }

    return this;
  }

  /**
   * Boot the application and all registered Service Providers.
   */
  public async boot(): Promise<void> {
    if (this.booted) return;
    this.bootPromise ??= Promise.resolve().then(async () => {
      for (const provider of this.providers) {
        await Promise.all(this.pendingRegistrations);
        await provider.boot();
      }
      this.booted = true;
    }).finally(() => {
      this.bootPromise = undefined;
    });
    await this.bootPromise;
  }

  /**
   * Get an active registered ServiceProvider instance by its class.
   */
  public getProvider<T extends ServiceProvider>(providerClass: new (...args: any[]) => T): T | undefined {
    return this.providers.find((p) => p instanceof providerClass) as T | undefined;
  }

  /**
   * List all registered ServiceProviders.
   */
  public getProviders(): readonly ServiceProvider[] {
    return this.providers;
  }

  public async handle(ctxOrReq: Context | IncomingMessage, maybeRes?: ServerResponse): Promise<void> {
    const ctx = ctxOrReq instanceof Context ? ctxOrReq : new Context(ctxOrReq, maybeRes!);

    // Maintenance Mode (bir down / bir up)
    const downFile = resolve(process.cwd(), 'storage/framework/down.json');
    if (existsSync(downFile)) {
      let message = 'Application is currently undergoing scheduled maintenance.';
      let retry = 60;
      try {
        const payload = JSON.parse(readFileSync(downFile, 'utf-8'));
        if (payload.message) message = String(payload.message);
        if (payload.retry) retry = Number(payload.retry) || 60;
      } catch {
        // fallback defaults
      }

      ctx.header('Retry-After', String(retry));
      const wantsJson = ctx.headers['accept']?.includes('application/json') || ctx.path.startsWith('/api/');
      if (wantsJson) {
        ctx.json({ error: 'Service Unavailable', message, retryAfter: retry }, 503);
      } else {
        const safeMsg = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        ctx.html(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>503 Maintenance</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;"><div style="max-width:460px;padding:32px;border:1px solid #27272a;border-radius:12px;background:#09090b;text-align:center;"><div style="font-size:11px;font-family:monospace;color:#f59e0b;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px;">503 Service Unavailable</div><h1 style="margin:0 0 10px;font-size:20px;font-weight:600;">Be Right Back</h1><p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;">${safeMsg}</p></div></body></html>`, 503);
      }
      return;
    }
    let index = -1;
    const middlewares = this.globalMiddlewares;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;

      const fn = middlewares[i];
      if (fn) {
        await fn(ctx, () => dispatch(i + 1));
      } else {
        const handled = await this.router.dispatch(ctx);
        if (!handled && !ctx.res.writableEnded) {
          await ErrorHandler.handleNotFound(ctx);
        }
      }
    };

    await requestContextStorage.run(ctx, async () => {
      try {
        if (!this.booted) await this.boot();
        await dispatch(0);
      } catch (err: any) {
        await ErrorHandler.handleException(ctx, err);
      }
    });
  }

  /**
   * Catch and render startup/import exceptions via the interactive Ignition Debug Screen.
   * Keeps the development server running when route or controller modules fail to load.
   */
  public catchBootError(err: any): void {
    console.error('\x1b[31m[BirJS Boot Error]\x1b[0m', err?.message || err);
    this.router.get('*', async (ctx) => {
      await ErrorHandler.handleException(ctx, err);
    });
  }

  public port: number = 3000;

  public listen(port: number = 3000, host: string = '0.0.0.0', callback?: (port: number) => void): Server {
    let currentPort = port;

    this.server = createServer(async (req, res) => {
      await this.handle(req, res);
    });

    // Attach WebSocket upgrade handler for Bir Broadcast
    this.server.on('upgrade', (req, socket, head) => {
      Broadcast.server.handleUpgrade(req, socket, head);
    });

    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        const nextPort = currentPort + 1;
        console.log(`\x1b[33m➜ Port ${currentPort} is in use, trying ${nextPort} instead...\x1b[0m`);
        currentPort = nextPort;
        this.port = currentPort;
        this.server!.listen(currentPort, host);
      } else {
        throw err;
      }
    });

    this.server.listen(port, host, () => {
      this.port = currentPort;
      if (currentPort !== port) {
        console.log(`\x1b[32m✔ Automatically switched to available port: http://localhost:${currentPort}\x1b[0m`);
      }
      if (callback) {
        callback(currentPort);
      }
    });

    return this.server;
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private shutdownHooked = false;

  /**
   * Register SIGINT / SIGTERM handlers to close active HTTP connections gracefully.
   */
  public enableGracefulShutdown(onShutdown?: () => Promise<void> | void): this {
    if (this.shutdownHooked) return this;
    this.shutdownHooked = true;

    const handleSignal = async (signal: string) => {
      console.log(`\n\x1b[33m[BirJS]\x1b[0m Received ${signal}. Closing server gracefully...`);
      try {
        await this.close();
        if (onShutdown) await onShutdown();
        process.exit(0);
      } catch (err) {
        console.error('[BirJS] Error during graceful shutdown:', err);
        process.exit(1);
      }
    };

    process.once('SIGINT', () => void handleSignal('SIGINT'));
    process.once('SIGTERM', () => void handleSignal('SIGTERM'));
    return this;
  }

  /**
   * Export a serverless HTTP handler compatible with Vercel, AWS Lambda, Netlify, etc.
   * Automatically resolves serverless URL rewrites (x-matched-path) and unhandled errors.
   */
  public serverless(options: { trustForwardedPath?: boolean } = {}): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
    return async (req: IncomingMessage, res: ServerResponse) => {
      try {
        // Resolve Vercel / Serverless rewrites only in trusted serverless environments or if explicitly trusted
        const isServerlessEnv =
          options.trustForwardedPath ??
          (process.env.VERCEL === '1' ||
            Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
            process.env.NETLIFY === 'true' ||
            process.env.TRUST_SERVERLESS_HEADERS === 'true');

        if (isServerlessEnv) {
          const matchedPath = (req.headers['x-matched-path'] || req.headers['x-forwarded-url']) as string | undefined;
          if (
            matchedPath &&
            typeof matchedPath === 'string' &&
            matchedPath.startsWith('/') &&
            !matchedPath.startsWith('//') &&
            !matchedPath.includes('..') &&
            !matchedPath.includes('\\')
          ) {
            req.url = matchedPath;
          } else if (req.url === '/api/index.js' || req.url === '/api/index' || req.url?.startsWith('/api/index?')) {
            req.url = '/';
          }
        } else if (req.url === '/api/index.js' || req.url === '/api/index' || req.url?.startsWith('/api/index?')) {
          req.url = '/';
        }

        await this.handle(req, res);
      } catch (err: any) {
        if (!res.writableEnded) {
          const isProduction = process.env.NODE_ENV === 'production';
          const isDebug = process.env.APP_DEBUG === 'true';
          const ctx = new Context(req, res);

          try {
            await ErrorHandler.handleException(ctx, err);
          } catch {
            if (!res.writableEnded) {
              res.statusCode = 500;
              const wantsJson =
                req.headers['accept']?.includes('application/json') ||
                req.url?.startsWith('/api/') ||
                req.url === '/api';

              if (wantsJson) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                const body =
                  isProduction && !isDebug
                    ? { error: 'Internal Server Error', message: 'Server Error' }
                    : { error: 'Internal Server Error', message: err?.message || 'Server Error', stack: err?.stack };
                res.end(JSON.stringify(body));
              } else {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                if (isProduction && !isDebug) {
                  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>500 - Server Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #000; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { text-align: center; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #ffffff; }
    p { color: #71717a; font-size: 1rem; }
  </style>
</head>
<body>
  <div class="box">
    <h1>500 Server Error</h1>
    <p>An unexpected error occurred. Please try again later.</p>
  </div>
</body>
</html>`);
                } else {
                  res.end(`
                    <div style="font-family:system-ui,-apple-system,sans-serif; padding:2.5rem; max-width:800px; margin:2rem auto; border:1px solid #fecdd3; border-radius:12px; background:#fff1f2;">
                      <h1 style="color:#e11d48; font-size:1.5rem; font-weight:700; margin-top:0;">BirFramework Serverless Error</h1>
                      <p style="color:#4c0519; font-size:0.95rem; line-height:1.5;">${err?.message || 'Internal Server Error'}</p>
                      <pre style="background:#18181b; color:#f4f4f5; padding:1.25rem; border-radius:8px; font-size:0.8rem; overflow:auto; line-height:1.4;">${err?.stack || ''}</pre>
                    </div>
                  `);
                }
              }
            }
          }
        }
      }
    };
  }
}

/**
 * Helper function to create a Vercel/Serverless handler from an Application instance
 */
export function createVercelHandler(app: Application): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return app.serverless();
}
