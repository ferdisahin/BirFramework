import { existsSync, createReadStream, statSync } from 'node:fs';
import { resolve, relative, extname, sep, basename } from 'node:path';
import type { Middleware } from '../router/middleware.js';
import type { Context } from './context.js';

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
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export interface StaticOptions {
  publicDir?: string;
  maxAge?: number;
  etag?: boolean;
}

export interface ServeFileOptions {
  maxAge?: number;
  etag?: boolean;
  downloadName?: string;
  cacheControl?: string;
}

/**
 * Stream a local file to the HTTP response with MIME detection, ETag/304,
 * and HTTP Range (206 Partial Content / 416 Range Not Satisfiable) support.
 */
export async function serveFile(
  ctx: Context,
  fullPath: string,
  options: ServeFileOptions = {}
): Promise<boolean> {
  if (!existsSync(fullPath)) return false;

  const stat = statSync(fullPath);
  if (!stat.isFile()) return false;

  const fileSize = stat.size;
  const ext = extname(fullPath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  ctx.header('Content-Type', mime);
  ctx.header('Cache-Control', options.cacheControl || `public, max-age=${options.maxAge ?? 3600}`);
  ctx.header('Accept-Ranges', 'bytes');

  if (options.downloadName) {
    const safeName = basename(options.downloadName).replace(/["\r\n]/g, '');
    ctx.header('Content-Disposition', `attachment; filename="${safeName}"`);
  }

  if (options.etag !== false) {
    const etag = `W/"${fileSize.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    ctx.header('ETag', etag);
    const ifNoneMatch = ctx.req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string' && (ifNoneMatch === etag || ifNoneMatch === '*')) {
      ctx.status(304);
      ctx.res.end();
      return true;
    }
  }

  if (ctx.method === 'HEAD') {
    ctx.header('Content-Length', String(fileSize));
    ctx.res.statusCode = 200;
    ctx.res.end();
    return true;
  }

  const rangeHeader = ctx.req.headers.range;
  if (typeof rangeHeader === 'string' && rangeHeader.startsWith('bytes=')) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match || (match[1] === '' && match[2] === '') || fileSize === 0) {
      ctx.header('Content-Range', `bytes */${fileSize}`);
      ctx.status(416);
      ctx.res.end();
      return true;
    }

    const [, startStr = '', endStr = ''] = match;
    let start: number;
    let end: number;
    if (startStr === '') {
      const suffix = parseInt(endStr, 10);
      start = Math.max(0, fileSize - suffix);
      end = fileSize - 1;
    } else {
      start = parseInt(startStr, 10);
      end = endStr !== '' ? Math.min(parseInt(endStr, 10), fileSize - 1) : fileSize - 1;
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start > end || start >= fileSize) {
      ctx.header('Content-Range', `bytes */${fileSize}`);
      ctx.status(416);
      ctx.res.end();
      return true;
    }

    const chunkSize = end - start + 1;
    ctx.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    ctx.header('Content-Length', String(chunkSize));
    ctx.status(206);
    await new Promise<void>((resStream, rejStream) => {
      const stream = createReadStream(fullPath, { start, end });
      stream.pipe(ctx.res);
      stream.on('finish', () => resStream());
      stream.on('close', () => resStream());
      stream.on('error', (err) => rejStream(err));
    });
    return true;
  }

  ctx.header('Content-Length', String(fileSize));
  ctx.status(200);
  await new Promise<void>((resStream, rejStream) => {
    const stream = createReadStream(fullPath);
    stream.pipe(ctx.res);
    stream.on('finish', () => resStream());
    stream.on('close', () => resStream());
    stream.on('error', (err) => rejStream(err));
  });
  return true;
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

    if (await serveFile(ctx, fullPath, { maxAge: options.maxAge, etag: options.etag })) {
      return;
    }

    await next();
  };
}
