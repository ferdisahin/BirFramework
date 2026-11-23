import type { Context } from '../http/context.js';
import { RouteEntry } from './route.js';
import type { HttpMethod, Middleware, RouteHandler } from './middleware.js';

export interface RouteGroupOptions {
  prefix?: string;
  middleware?: Middleware | Middleware[];
  name?: string;
}

export interface ResourceController {
  index?(ctx: Context): any;
  show?(ctx: Context): any;
  store?(ctx: Context): any;
  update?(ctx: Context): any;
  destroy?(ctx: Context): any;
  [key: string]: any;
}

export class Router {
  private routes: RouteEntry[] = [];
  private groupStack: RouteGroupOptions[] = [];
  private parent?: Router;

  constructor(parent?: Router) {
    this.parent = parent;
  }

  public getRoutes(): RouteEntry[] {
    return [...(this.parent ? this.parent.getRoutes() : []), ...this.routes];
  }

  public clone(): Router {
    const copy = new Router(this.parent);
    copy.routes = [...this.routes];
    return copy;
  }

  public addRoute(method: HttpMethod, path: string, handler: RouteHandler): RouteEntry {
    const fullPath = this.resolveGroupPath(path);
    const route = new RouteEntry(method, fullPath, handler);

    const groupMiddlewares = this.resolveGroupMiddlewares();
    if (groupMiddlewares.length > 0) {
      route.middleware(...groupMiddlewares);
    }

    const groupName = this.resolveGroupName();
    if (groupName) {
      route.name(groupName);
    }

    this.routes.push(route);
    return route;
  }

  public get(path: string, handler: RouteHandler): RouteEntry {
    return this.addRoute('GET', path, handler);
  }

  public post(path: string, handler: RouteHandler): RouteEntry {
    return this.addRoute('POST', path, handler);
  }

  public put(path: string, handler: RouteHandler): RouteEntry {
    return this.addRoute('PUT', path, handler);
  }

  public patch(path: string, handler: RouteHandler): RouteEntry {
    return this.addRoute('PATCH', path, handler);
  }

  public delete(path: string, handler: RouteHandler): RouteEntry {
    return this.addRoute('DELETE', path, handler);
  }

  public all(path: string, handler: RouteHandler): RouteEntry {
    return this.addRoute('ALL', path, handler);
  }

  public group(options: RouteGroupOptions, callback: () => void): void {
    this.groupStack.push(options);
    try {
      callback();
    } finally {
      this.groupStack.pop();
    }
  }

  public resource(name: string, controller: ResourceController): void {
    const cleanName = name.replace(/^\/+|\/+$/g, '');
    const param = 'id';

    if (typeof controller.index === 'function') {
      this.get(`/${cleanName}`, (ctx) => controller.index!(ctx)).name(`${cleanName}.index`);
    }
    if (typeof controller.store === 'function') {
      this.post(`/${cleanName}`, (ctx) => controller.store!(ctx)).name(`${cleanName}.store`);
    }
    if (typeof controller.show === 'function') {
      this.get(`/${cleanName}/:${param}`, (ctx) => controller.show!(ctx)).name(`${cleanName}.show`);
    }
    if (typeof controller.update === 'function') {
      this.put(`/${cleanName}/:${param}`, (ctx) => controller.update!(ctx)).name(`${cleanName}.update`);
      this.patch(`/${cleanName}/:${param}`, (ctx) => controller.update!(ctx)).name(`${cleanName}.update`);
    }
    if (typeof controller.destroy === 'function') {
      this.delete(`/${cleanName}/:${param}`, (ctx) => controller.destroy!(ctx)).name(`${cleanName}.destroy`);
    }
  }

  public async dispatch(ctx: Context, globalMiddlewares: Middleware[] = []): Promise<boolean> {
    const path = ctx.path;
    const method = ctx.method;

    for (const route of this.routes) {
      const { matches, params } = route.match(method, path);
      if (matches) {
        ctx.params = params;

        const pipeline = [...globalMiddlewares, ...route.middlewares];
        await this.runPipeline(ctx, pipeline, async (c) => {
          const result = await route.handler(c);
          if (result !== undefined && !c.res.writableEnded) {
            if (result && typeof (result as any).resolve === 'function') {
              const status = (result as any).statusCode || 200;
              c.json((result as any).resolve(c), status);
            } else if (typeof result === 'object' && result !== null) {
              c.json(result);
            } else if (typeof result === 'string') {
              c.text(result);
            }
          }
        });
        return true;
      }
    }

    if (this.parent) {
      return this.parent.dispatch(ctx, globalMiddlewares);
    }

    return false;
  }

  private async runPipeline(
    ctx: Context,
    middlewares: Middleware[],
    destination: (ctx: Context) => Promise<void>
  ): Promise<void> {
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      if (i === middlewares.length) {
        await destination(ctx);
        return;
      }

      const middleware = middlewares[i]!;
      await middleware(ctx, () => dispatch(i + 1));
    };

    await dispatch(0);
  }

  private resolveGroupPath(path: string): string {
    const prefixes = this.groupStack
      .map((g) => g.prefix)
      .filter((p): p is string => Boolean(p && p.trim().length > 0))
      .map((p) => (p.startsWith('/') ? p : `/${p}`).replace(/\/+$/, ''));

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const full = `${prefixes.join('')}${cleanPath}`.replace(/\/+/g, '/');
    return full === '' ? '/' : full;
  }

  private resolveGroupMiddlewares(): Middleware[] {
    const middlewares: Middleware[] = [];
    for (const group of this.groupStack) {
      if (group.middleware) {
        if (Array.isArray(group.middleware)) {
          middlewares.push(...group.middleware);
        } else {
          middlewares.push(group.middleware);
        }
      }
    }
    return middlewares;
  }

  private resolveGroupName(): string {
    return this.groupStack
      .map((g) => g.name)
      .filter((n): n is string => Boolean(n))
      .join('.');
  }
}

export const defaultRouter = new Router();

export const Route = {
  get: (path: string, handler: RouteHandler): RouteEntry => defaultRouter.get(path, handler),
  post: (path: string, handler: RouteHandler): RouteEntry => defaultRouter.post(path, handler),
  put: (path: string, handler: RouteHandler): RouteEntry => defaultRouter.put(path, handler),
  patch: (path: string, handler: RouteHandler): RouteEntry => defaultRouter.patch(path, handler),
  delete: (path: string, handler: RouteHandler): RouteEntry => defaultRouter.delete(path, handler),
  all: (path: string, handler: RouteHandler): RouteEntry => defaultRouter.all(path, handler),
  group: (options: RouteGroupOptions, callback: () => void): void => defaultRouter.group(options, callback),
  resource: (name: string, controller: ResourceController): void => defaultRouter.resource(name, controller),
  getRoutes: (): RouteEntry[] => defaultRouter.getRoutes(),
};
