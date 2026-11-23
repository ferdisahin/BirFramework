import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Middleware } from '../router/middleware.js';
import type { Context } from '../http/context.js';

function safeCompare(a: any, b: any): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function csrfToken(ctx: Context): string {
  if (!ctx.session) {
    throw new Error('[BirSecurity] Session middleware is required to use CSRF protection.');
  }

  let token = ctx.session.get('_csrf_token');
  if (!token) {
    token = randomBytes(24).toString('hex');
    ctx.session.set('_csrf_token', token);
  }

  return token;
}

export function csrfField(ctx: Context): string {
  const token = csrfToken(ctx);
  return `<input type="hidden" name="_token" value="${token}">`;
}

export function csrf(): Middleware {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  return async (ctx: Context, next) => {
    // If session middleware is missing or not yet executed
    if (!ctx.session) {
      if (safeMethods.includes(ctx.method)) {
        await next();
        return;
      }

      // On state-changing requests (POST, PUT, DELETE, PATCH), refuse to silently bypass CSRF protection
      if (ctx.headers['accept']?.includes('application/json') || ctx.path.startsWith('/api/')) {
        return ctx.json(
          {
            error: 'Forbidden',
            message: '[BirSecurity] CSRF protection is active but no active session was found. Ensure sessionMiddleware is registered before csrf().',
          },
          403
        );
      }

      return ctx.status(403).html(`
        <div style="font-family:system-ui;text-align:center;padding:3rem;">
          <h1 style="color:#ef4444;">403 | Forbidden</h1>
          <p>CSRF protection is active on this route, but no session is available. Please ensure cookies are enabled.</p>
        </div>
      `);
    }

    // Ensure token is generated
    const sessionToken = csrfToken(ctx);

    // Skip safe read-only methods
    if (safeMethods.includes(ctx.method)) {
      await next();
      return;
    }

    // Check request header or body
    const headerToken = ctx.headers['x-csrf-token'] || ctx.headers['x-xsrf-token'];
    const body = (await ctx.body()) || {};
    const bodyToken = body._token;

    const providedToken = headerToken || bodyToken;

    if (!providedToken || !safeCompare(providedToken, sessionToken)) {
      if (ctx.headers['accept']?.includes('application/json')) {
        return ctx.json({ error: 'CSRF token mismatch. Page Expired.' }, 419);
      }
      return ctx.status(419).html(`
        <div style="font-family:system-ui;text-align:center;padding:3rem;">
          <h1 style="color:#ef4444;">419 | Page Expired</h1>
          <p>Your session or CSRF token has expired. Please refresh the page and try again.</p>
          <a href="javascript:history.back()" style="color:#3b82f6;">&laquo; Go Back</a>
        </div>
      `);
    }

    await next();
  };
}
