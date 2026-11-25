import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import type { Middleware } from '../router/middleware.js';
import { Log } from '../logging/log.js';

export function logger(): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    const status = ctx.res.statusCode;
    const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
    const reset = '\x1b[0m';
    console.log(`[HTTP] ${ctx.method} ${ctx.path} ${statusColor}${status}${reset} - ${duration}ms`);
    Log.info(`${ctx.method} ${ctx.path} ${status} - ${duration}ms`);
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

export interface CompressOptions {
  /** Minimum response size in bytes before compression is applied. Default: 1024 */
  threshold?: number;
  /** Enable Brotli (`br`) compression when supported by the client. Default: true */
  brotli?: boolean;
  /** Enable Gzip (`gzip`) compression when supported by the client. Default: true */
  gzip?: boolean;
}

/**
 * Response compression middleware supporting Brotli (`br`) and Gzip (`gzip`).
 * Skips HEAD, 204/206/304, SSE (`text/event-stream`), and binary media (`audio/*`, `video/*`, `image/*`).
 */
export function compress(options: CompressOptions = {}): Middleware {
  const threshold = options.threshold ?? 1024;
  const allowBrotli = options.brotli !== false;
  const allowGzip = options.gzip !== false;

  return async (ctx, next) => {
    if (ctx.method === 'HEAD') {
      await next();
      return;
    }

    const acceptEncoding = String(ctx.req.headers['accept-encoding'] || '').toLowerCase();
    const encoding: 'br' | 'gzip' | null =
      allowBrotli && acceptEncoding.includes('br')
        ? 'br'
        : allowGzip && acceptEncoding.includes('gzip')
          ? 'gzip'
          : null;

    if (!encoding) {
      await next();
      return;
    }

    const res = ctx.res;
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    const chunks: Buffer[] = [];
    let bypassed = false;

    const shouldSkip = (): boolean => {
      if (res.headersSent) return true;
      const status = res.statusCode;
      if (status === 204 || status === 206 || status === 304) return true;
      if (res.getHeader('Content-Encoding')) return true;
      const ct = String(res.getHeader('Content-Type') || '').toLowerCase();
      if (
        ct.startsWith('text/event-stream') ||
        ct.startsWith('audio/') ||
        ct.startsWith('video/') ||
        ct.startsWith('image/')
      ) {
        return true;
      }
      return false;
    };

    const flushBypassed = () => {
      bypassed = true;
      for (const c of chunks) {
        origWrite(c);
      }
      chunks.length = 0;
    };

    res.write = ((chunk: any, encOrCb?: any, cb?: any): boolean => {
      if (bypassed) return origWrite(chunk, encOrCb, cb);
      if (shouldSkip()) {
        flushBypassed();
        return origWrite(chunk, encOrCb, cb);
      }
      if (chunk !== undefined && chunk !== null) {
        const enc = typeof encOrCb === 'string' ? (encOrCb as BufferEncoding) : 'utf-8';
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
      }
      if (typeof encOrCb === 'function') encOrCb();
      else if (typeof cb === 'function') cb();
      return true;
    }) as typeof res.write;

    res.end = ((chunk?: any, encOrCb?: any, cb?: any): typeof res => {
      if (bypassed) return origEnd(chunk, encOrCb, cb);

      if (chunk !== undefined && chunk !== null && typeof chunk !== 'function') {
        const enc = typeof encOrCb === 'string' ? (encOrCb as BufferEncoding) : 'utf-8';
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
      }

      const body = Buffer.concat(chunks);
      chunks.length = 0;

      if (shouldSkip() || body.length < threshold) {
        return origEnd(body.length > 0 ? body : undefined, typeof encOrCb === 'function' ? encOrCb : cb);
      }

      const compressed =
        encoding === 'br'
          ? brotliCompressSync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } })
          : gzipSync(body, { level: 4 });
      res.removeHeader('Content-Length');
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', String(compressed.length));

      return origEnd(compressed, typeof encOrCb === 'function' ? encOrCb : cb);
    }) as typeof res.end;

    try {
      await next();
    } finally {
      res.write = origWrite;
      res.end = origEnd;
    }
  };
}
