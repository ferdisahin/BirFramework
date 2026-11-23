import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { watch, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Context } from '../http/context.js';
import { Router, defaultRouter } from '../router/router.js';
import { Container, app as defaultContainer } from '../container/container.js';
import { serveStatic } from '../http/static.js';
import { sessionMiddleware } from '../auth/session.js';
import { ErrorHandler } from '../errors/handler.js';
import { Broadcast } from '../broadcasting/index.js';
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
  private liveClients = new Set<(msg: string) => void>();
  private fileWatcherInitialized: boolean = false;

  constructor(options: ApplicationOptions = {}) {
    this.router = options.router || defaultRouter;
    this.container = options.container || defaultContainer;

    // Register self in container
    this.container.singleton(Application, this);

    // Default static file serving for public directory
    this.use(serveStatic());

    // Default session middleware
    this.use(sessionMiddleware());

    // Register live reload in non-production environments
    if (process.env.NODE_ENV !== 'production') {
      this.setupLiveReload();
    }
  }

  private setupLiveReload(): void {
    this.router.get('/__bir_live_reload', (ctx) => {
      ctx.header('Content-Type', 'text/event-stream');
      ctx.header('Cache-Control', 'no-cache');
      ctx.header('Connection', 'keep-alive');
      ctx.res.flushHeaders?.();

      const send = (msg: string) => {
        try {
          ctx.res.write(`data: ${msg}\n\n`);
        } catch {
          // client disconnected
        }
      };

      this.liveClients.add(send);
      send('connected');

      ctx.req.on('close', () => {
        this.liveClients.delete(send);
      });

      this.initFileWatcher();
    });
  }

  private initFileWatcher(): void {
    if (this.fileWatcherInitialized) return;
    this.fileWatcherInitialized = true;

    const dirsToWatch = ['views', 'public', 'routes', 'app', 'docs'];
    let debounceTimer: NodeJS.Timeout | null = null;

    for (const dir of dirsToWatch) {
      const fullPath = resolve(process.cwd(), dir);
      if (existsSync(fullPath)) {
        try {
          watch(fullPath, { recursive: true }, (_, filename) => {
            if (!filename) return;
            if (debounceTimer) clearTimeout(debounceTimer);

            debounceTimer = setTimeout(() => {
              const isCss = filename.endsWith('.css');
              const action = isCss ? 'css-reload' : 'reload';
              for (const send of this.liveClients) {
                send(action);
              }
            }, 60);
          });
        } catch {
          // ignore unsupported recursive watch
        }
      }
    }
  }

  public use(...middlewares: Middleware[]): this {
    this.globalMiddlewares.push(...middlewares);
    return this;
  }

  public async handle(ctxOrReq: Context | IncomingMessage, maybeRes?: ServerResponse): Promise<void> {
    const ctx = ctxOrReq instanceof Context ? ctxOrReq : new Context(ctxOrReq, maybeRes!);
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
          ErrorHandler.handleNotFound(ctx);
        }
      }
    };

    try {
      await dispatch(0);
    } catch (err: any) {
      await ErrorHandler.handleException(ctx, err);
    }
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

  /**
   * Export a serverless HTTP handler compatible with Vercel, AWS Lambda, Netlify, etc.
   * Automatically resolves serverless URL rewrites (x-matched-path) and unhandled errors.
   */
  public serverless(): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
    return async (req: IncomingMessage, res: ServerResponse) => {
      try {
        // Resolve Vercel / Serverless rewrites
        const matchedPath = (req.headers['x-matched-path'] || req.headers['x-forwarded-url']) as string | undefined;
        if (matchedPath && typeof matchedPath === 'string') {
          req.url = matchedPath;
        } else if (req.url === '/api/index.js' || req.url === '/api/index' || req.url?.startsWith('/api/index?')) {
          req.url = '/';
        }

        await this.handle(req, res);
      } catch (err: any) {
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(`
            <div style="font-family:system-ui,-apple-system,sans-serif; padding:2.5rem; max-width:800px; margin:2rem auto; border:1px solid #fecdd3; border-radius:12px; background:#fff1f2;">
              <h1 style="color:#e11d48; font-size:1.5rem; font-weight:700; margin-top:0;">BirFramework Serverless Error</h1>
              <p style="color:#4c0519; font-size:0.95rem; line-height:1.5;">${err?.message || 'Internal Server Error'}</p>
              <pre style="background:#18181b; color:#f4f4f5; padding:1.25rem; border-radius:8px; font-size:0.8rem; overflow:auto; line-height:1.4;">${err?.stack || ''}</pre>
            </div>
          `);
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
