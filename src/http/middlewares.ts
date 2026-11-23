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
  origin?: string;
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
}

export function cors(options: CorsOptions = {}): Middleware {
  const origin = options.origin || '*';
  const methods = (options.methods || ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']).join(', ');
  const headers = (options.headers || ['Content-Type', 'Authorization', 'X-Requested-With']).join(', ');

  return async (ctx, next) => {
    ctx.header('Access-Control-Allow-Origin', origin);
    ctx.header('Access-Control-Allow-Methods', methods);
    ctx.header('Access-Control-Allow-Headers', headers);
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
