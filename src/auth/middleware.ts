import type { Middleware } from '../router/middleware.js';
import { Auth } from './auth.js';

export function auth(options: { redirectTo?: string } = {}): Middleware {
  const loginPath = options.redirectTo || '/login';

  return async (ctx, next) => {
    if (!Auth.check(ctx)) {
      const acceptsJson = ctx.headers['accept']?.includes('application/json') || ctx.path.startsWith('/api');
      if (acceptsJson) {
        return ctx.json({ error: 'Unauthorized' }, 401);
      }
      ctx.header('Location', loginPath);
      ctx.status(302).text('');
      return;
    }
    await next();
  };
}

export function guest(options: { redirectTo?: string } = {}): Middleware {
  const homePath = options.redirectTo || '/';

  return async (ctx, next) => {
    if (Auth.check(ctx)) {
      ctx.header('Location', homePath);
      ctx.status(302).text('');
      return;
    }
    await next();
  };
}
