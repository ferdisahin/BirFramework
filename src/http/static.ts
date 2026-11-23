import { existsSync, createReadStream, statSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import type { Middleware } from '../router/middleware.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

export interface StaticOptions {
  publicDir?: string;
  maxAge?: number;
}

export function serveStatic(options: StaticOptions = {}): Middleware {
  const publicDir = resolve(options.publicDir || resolve(process.cwd(), 'public'));

  return async (ctx, next) => {
    // Only serve GET and HEAD for static files
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
      await next();
      return;
    }

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(ctx.path);
    } catch {
      await next();
      return;
    }

    // Reject null bytes and path traversal signatures
    if (decodedPath.includes('\0')) {
      await next();
      return;
    }

    const cleanPath = decodedPath.replace(/^\/+/, '');
    const fullPath = resolve(publicDir, cleanPath);

    // Prevent directory traversal attacks using relative path inspection
    const rel = relative(publicDir, fullPath);
    if (rel.startsWith('..') || rel.startsWith(sep + '..') || fullPath === publicDir) {
      await next();
      return;
    }

    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      const ext = extname(fullPath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';

      ctx.header('Content-Type', mime);
      ctx.header('Cache-Control', `public, max-age=${options.maxAge || 3600}`);

      if (ctx.method === 'HEAD') {
        ctx.res.statusCode = 200;
        ctx.res.end();
        return;
      }

      ctx.status(200);
      return new Promise<void>((resStream, rejStream) => {
        const stream = createReadStream(fullPath);
        stream.pipe(ctx.res);
        stream.on('finish', () => resStream());
        stream.on('close', () => resStream());
        stream.on('error', (err) => rejStream(err));
      });
    }

    await next();
  };
}
