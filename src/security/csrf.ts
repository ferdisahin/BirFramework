import { randomBytes } from 'node:crypto';
import type { Middleware } from '../router/middleware.js';
import type { Context } from '../http/context.js';

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
    if (!ctx.session) {
      await next();
      return;
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

    if (!providedToken || providedToken !== sessionToken) {
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
