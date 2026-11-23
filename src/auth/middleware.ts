import type { Middleware } from '../router/middleware.js';
import { Auth } from './auth.js';

export interface AuthMiddlewareOptions {
  redirectTo?: string;
  abilities?: string[];
}

export function auth(options: AuthMiddlewareOptions = {}): Middleware {
  const loginPath = options.redirectTo || '/login';

  return async (ctx, next) => {
    if (!Auth.check(ctx)) {
      await Auth.authenticateToken(ctx);
    }

    if (!Auth.check(ctx)) {
      const acceptsJson = ctx.headers['accept']?.includes('application/json') || ctx.path.startsWith('/api');
      if (acceptsJson) {
        return ctx.json({ error: 'Unauthorized' }, 401);
      }
      ctx.header('Location', loginPath);
      ctx.status(302).text('');
      return;
    }

    if (options.abilities && options.abilities.length > 0) {
      const token = Auth.token(ctx);
      if (token) {
        const hasAll = options.abilities.every((ab) => token.can(ab));
        if (!hasAll) {
          return ctx.json({ error: 'Forbidden', message: `Missing required token ability: ${options.abilities.join(', ')}` }, 403);
        }
      }
    }

    await next();
  };
}

export function hasAbility(ability: string | string[]): Middleware {
  const abilities = Array.isArray(ability) ? ability : [ability];
  return async (ctx, next) => {
    if (!Auth.check(ctx)) {
      await Auth.authenticateToken(ctx);
    }

    const token = Auth.token(ctx);
    if (!token) {
      return ctx.json({ error: 'Unauthorized', message: 'Personal access token required for ability verification' }, 401);
    }

    const hasAll = abilities.every((a) => token.can(a));
    if (!hasAll) {
      return ctx.json({ error: 'Forbidden', message: `Token lacks required ability: ${abilities.join(', ')}` }, 403);
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
