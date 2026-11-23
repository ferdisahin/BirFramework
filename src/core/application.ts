import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { watch, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Context } from '../http/context.js';
import { Router, defaultRouter } from '../router/router.js';
import { Container, app as defaultContainer } from '../container/container.js';
import { serveStatic } from '../http/static.js';
import { sessionMiddleware } from '../auth/session.js';
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
          ctx.json({ error: 'Not Found', path: ctx.path, method: ctx.method }, 404);
        }
      }
    };

    try {
      await dispatch(0);
    } catch (err: any) {
      if (!ctx.res.writableEnded) {
        if (err.name === 'ValidationError') {
          ctx.json({ message: err.message, errors: err.errors }, 422);
          return;
        }
        if (err.name === 'AuthorizationError') {
          ctx.json({ message: err.message, error: 'Forbidden' }, 403);
          return;
        }
        console.error(`[BirFramework Error]`, err);
        ctx.json({
          error: 'Internal Server Error',
          message: err.message,
          stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
        }, 500);
      }
    }
  }

  public port: number = 3000;

  public listen(port: number = 3000, host: string = '0.0.0.0', callback?: (port: number) => void): Server {
    let currentPort = port;

    this.server = createServer(async (req, res) => {
      await this.handle(req, res);
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
}
