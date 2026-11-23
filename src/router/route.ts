import type { HttpMethod, Middleware, RouteHandler } from './middleware.js';

export class RouteEntry {
  public nameStr: string = '';
  public middlewares: Middleware[] = [];
  public readonly regex: RegExp;
  public readonly paramNames: string[] = [];

  constructor(
    public readonly method: HttpMethod,
    public readonly path: string,
    public readonly handler: RouteHandler
  ) {
    const { regex, paramNames } = this.compilePath(path);
    this.regex = regex;
    this.paramNames = paramNames;
  }

  public name(name: string): this {
    this.nameStr = name;
    return this;
  }

  public middleware(...middlewares: Middleware[]): this {
    this.middlewares.push(...middlewares);
    return this;
  }

  public match(method: string, path: string): { matches: boolean; params: Record<string, string> } {
    if (this.method !== 'ALL' && this.method !== method) {
      return { matches: false, params: {} };
    }

    const match = this.regex.exec(path);
    if (!match) {
      return { matches: false, params: {} };
    }

    const params: Record<string, string> = {};
    for (let i = 0; i < this.paramNames.length; i++) {
      const paramName = this.paramNames[i]!;
      if (paramName === '__proto__' || paramName === 'constructor' || paramName === 'prototype') {
        continue;
      }
      const paramValue = match[i + 1];
      if (paramValue !== undefined) {
        try {
          params[paramName] = decodeURIComponent(paramValue);
        } catch {
          params[paramName] = paramValue;
        }
      }
    }

    return { matches: true, params };
  }

  private compilePath(path: string): { regex: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    const normalized = path.startsWith('/') ? path : `/${path}`;

    const regexPattern = normalized
      .replace(/\/+/g, '/')
      .replace(/(?::([a-zA-Z0-9_]+)|\{([a-zA-Z0-9_]+)\})/g, (_, p1, p2) => {
        const param = p1 || p2;
        paramNames.push(param);
        return '([^/]+)';
      });

    const finalPattern = `^${regexPattern === '/' ? '/?' : regexPattern.replace(/\/$/, '') + '/?'}$`;
    return {
      regex: new RegExp(finalPattern),
      paramNames,
    };
  }
}
