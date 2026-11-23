import { createServer, type Server } from 'node:http';
import { Context } from '../http/context.js';
import { Router, defaultRouter } from '../router/router.js';
import { Container, app as defaultContainer } from '../container/container.js';
import { serveStatic } from '../http/static.js';
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

  constructor(options: ApplicationOptions = {}) {
    this.router = options.router || defaultRouter;
    this.container = options.container || defaultContainer;

    // Register self in container
    this.container.singleton(Application, this);

    // Default static file serving for public directory
    this.use(serveStatic());
  }

  public use(...middlewares: Middleware[]): this {
    this.globalMiddlewares.push(...middlewares);
    return this;
  }

  public port: number = 3000;

  public listen(port: number = 3000, host: string = '0.0.0.0', callback?: (port: number) => void): Server {
    let currentPort = port;

    this.server = createServer(async (req, res) => {
      const ctx = new Context(req, res);

      try {
        const handled = await this.router.dispatch(ctx, this.globalMiddlewares);
        if (!handled && !res.writableEnded) {
          ctx.json({ error: 'Not Found', path: ctx.path, method: ctx.method }, 404);
        }
      } catch (err: any) {
        if (!res.writableEnded) {
          if (err.name === 'ValidationError') {
            ctx.json({ message: err.message, errors: err.errors }, 422);
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
