import type { Middleware } from '../router/middleware.js';

export function logger(): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    const status = ctx.res.statusCode;
    const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
    const reset = '\x1b[0m';
    console.log(`[HTTP] ${ctx.method} ${ctx.path} ${statusColor}${status}${reset} - ${duration}ms`);
  };
}

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean | string);
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
}

export function cors(options: CorsOptions = {}): Middleware {
  const allowedMethods = (options.methods || ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']).join(', ');
  const allowedHeaders = (options.headers || ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-TOKEN']).join(', ');

  return async (ctx, next) => {
    const requestOrigin = (ctx.headers['origin'] as string) || '';

    let allowOrigin = '*';
    if (typeof options.origin === 'function') {
      const res = options.origin(requestOrigin);
      if (typeof res === 'string') {
        allowOrigin = res;
      } else if (res === true) {
        allowOrigin = requestOrigin;
      } else {
        allowOrigin = 'null';
      }
    } else if (Array.isArray(options.origin)) {
      if (options.origin.includes(requestOrigin)) {
        allowOrigin = requestOrigin;
      } else {
        allowOrigin = 'null';
      }
    } else if (typeof options.origin === 'string') {
      allowOrigin = options.origin;
    } else if (options.credentials && requestOrigin) {
      // Browsers reject Access-Control-Allow-Origin: * when credentials are true
      allowOrigin = requestOrigin;
    }

    ctx.header('Access-Control-Allow-Origin', allowOrigin);
    ctx.header('Access-Control-Allow-Methods', allowedMethods);
    ctx.header('Access-Control-Allow-Headers', allowedHeaders);

    if (options.credentials) {
      ctx.header('Access-Control-Allow-Credentials', 'true');
    }

    if (ctx.method === 'OPTIONS') {
      ctx.status(204).text('');
      return;
    }

    await next();
  };
}

export interface SecurityHeadersOptions {
  frameGuard?: 'DENY' | 'SAMEORIGIN' | false;
  noSniff?: boolean;
  xssFilter?: boolean;
  referrerPolicy?: string | false;
}

export function securityHeaders(options: SecurityHeadersOptions = {}): Middleware {
  const frameGuard = options.frameGuard !== undefined ? options.frameGuard : 'SAMEORIGIN';
  const noSniff = options.noSniff !== undefined ? options.noSniff : true;
  const xssFilter = options.xssFilter !== undefined ? options.xssFilter : true;
  const referrerPolicy = options.referrerPolicy !== undefined ? options.referrerPolicy : 'strict-origin-when-cross-origin';

  return async (ctx, next) => {
    if (frameGuard) {
      ctx.header('X-Frame-Options', frameGuard);
    }
    if (noSniff) {
      ctx.header('X-Content-Type-Options', 'nosniff');
    }
    if (xssFilter) {
      ctx.header('X-XSS-Protection', '0');
    }
    if (referrerPolicy) {
      ctx.header('Referrer-Policy', referrerPolicy);
    }

    await next();
  };
}
