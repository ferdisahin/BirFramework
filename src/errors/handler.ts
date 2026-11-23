import type { Context } from '../http/context.js';
import { defaultViewEngine } from '../view/engine.js';
import { DebugScreen } from './debug-screen.js';
import { StackParser } from './stack-parser.js';
import { VERSION } from '../version.js';

export class ErrorHandler {
  /**
   * Handle 404 Not Found
   */
  public static handleNotFound(ctx: Context): void {
    const wantsHtml =
      ctx.headers['accept']?.includes('text/html') &&
      !ctx.headers['accept']?.includes('application/json') &&
      !ctx.path.startsWith('/api/') &&
      ctx.path !== '/api';

    if (wantsHtml) {
      // Try rendering user-defined views/errors/404.html
      try {
        const rendered = defaultViewEngine.render('errors/404', {
          title: '404 - Page Not Found',
          path: ctx.path,
          method: ctx.method,
        });
        ctx.html(rendered, 404);
        return;
      } catch {
        // Fallback to built-in BirFramework 404 page
        ctx.html(this.renderBuiltin404(ctx), 404);
        return;
      }
    }

    ctx.json(
      {
        error: 'Not Found',
        message: `Route [${ctx.method} ${ctx.path}] not found.`,
        path: ctx.path,
        method: ctx.method,
      },
      404
    );
  }

  /**
   * Handle unhandled exceptions & errors
   */
  public static async handleException(ctx: Context, err: any): Promise<void> {
    if (ctx.res.writableEnded) return;

    const wantsHtml =
      ctx.headers['accept']?.includes('text/html') &&
      !ctx.headers['accept']?.includes('application/json') &&
      !ctx.path.startsWith('/api/') &&
      ctx.path !== '/api';

    // 1. Validation Errors (422)
    if (err?.name === 'ValidationError') {
      if (wantsHtml && ctx.session) {
        ctx.session.flash('error', err.message);
        ctx.session.flash('errors', err.errors);
        const referer = (ctx.headers['referer'] as string) || '/';
        ctx.redirect(referer);
        return;
      }

      ctx.json({ message: err.message, errors: err.errors }, 422);
      return;
    }

    // 2. Authorization Errors (403)
    if (err?.name === 'AuthorizationError') {
      if (wantsHtml) {
        try {
          const rendered = defaultViewEngine.render('errors/403', {
            title: '403 - Forbidden',
            message: err.message,
          });
          ctx.html(rendered, 403);
          return;
        } catch {
          ctx.html(this.renderBuiltin403(err.message), 403);
          return;
        }
      }

      ctx.json({ message: err.message, error: 'Forbidden' }, 403);
      return;
    }

    // 3. 500 Internal Server Errors
    console.error(`\x1b[31m[BirFramework Error]\x1b[0m`, err);

    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      if (wantsHtml) {
        try {
          const rendered = defaultViewEngine.render('errors/500', {
            title: '500 - Server Error',
          });
          ctx.html(rendered, 500);
          return;
        } catch {
          ctx.html(this.renderBuiltin500(), 500);
          return;
        }
      }

      ctx.json(
        {
          error: 'Internal Server Error',
          message: 'Server Error',
        },
        500
      );
      return;
    }

    // Development Environment:
    if (wantsHtml) {
      // Show interactive Ignition Debug Error Screen!
      const debugHtml = DebugScreen.render(ctx, err);
      ctx.html(debugHtml, 500);
      return;
    }

    // JSON API response in Development
    const frames = StackParser.parse(err?.stack);
    const topFrame = StackParser.getTopAppFrame(frames);

    ctx.json(
      {
        error: err?.name || 'Internal Server Error',
        message: err?.message,
        file: topFrame?.shortFile,
        line: topFrame?.line,
        stack: err?.stack,
      },
      500
    );
  }

  private static renderBuiltin404(ctx: Context): string {
    return `<!DOCTYPE html>
<html lang="en" style="background: #09090b; color: #f4f4f5; font-family: system-ui, -apple-system, sans-serif;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Page Not Found | BirFramework</title>
</head>
<body style="min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 24px; text-align: center;">
  <div style="max-width: 480px;">
    <div style="font-size: 84px; font-weight: 900; color: #38bdf8; font-family: ui-monospace, monospace; line-height: 1; margin-bottom: 16px;">404</div>
    <h1 style="font-size: 24px; font-weight: 800; color: #ffffff; margin-bottom: 8px;">Page Not Found</h1>
    <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6; margin-bottom: 24px;">
      The requested route <code style="background: #27272a; padding: 3px 8px; border-radius: 6px; color: #f4f4f5; font-size: 13px;">${ctx.method} ${ctx.path}</code> was not found on this server.
    </p>
    <a href="/" style="display: inline-block; background: #38bdf8; color: #09090b; font-weight: 700; font-size: 13px; padding: 10px 24px; border-radius: 10px; text-decoration: none; transition: opacity 0.2s;">
      &larr; Return to Homepage
    </a>
    <div style="margin-top: 36px; font-size: 11px; color: #52525b;">BirFramework v${VERSION}</div>
  </div>
</body>
</html>`;
  }

  private static renderBuiltin403(message: string): string {
    return `<!DOCTYPE html>
<html lang="en" style="background: #09090b; color: #f4f4f5; font-family: system-ui, -apple-system, sans-serif;">
<head>
  <meta charset="UTF-8">
  <title>403 - Forbidden | BirFramework</title>
</head>
<body style="min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 24px; text-align: center;">
  <div style="max-width: 480px;">
    <div style="font-size: 84px; font-weight: 900; color: #f59e0b; font-family: ui-monospace, monospace; line-height: 1; margin-bottom: 16px;">403</div>
    <h1 style="font-size: 24px; font-weight: 800; color: #ffffff; margin-bottom: 8px;">Access Forbidden</h1>
    <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6; margin-bottom: 24px;">${message || 'You do not have permission to access this resource.'}</p>
    <a href="/" style="display: inline-block; background: #27272a; color: #ffffff; font-weight: 600; font-size: 13px; padding: 10px 24px; border-radius: 10px; text-decoration: none;">&larr; Return Home</a>
  </div>
</body>
</html>`;
  }

  private static renderBuiltin500(): string {
    return `<!DOCTYPE html>
<html lang="en" style="background: #09090b; color: #f4f4f5; font-family: system-ui, -apple-system, sans-serif;">
<head>
  <meta charset="UTF-8">
  <title>500 - Server Error</title>
</head>
<body style="min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 24px; text-align: center;">
  <div style="max-width: 480px;">
    <div style="font-size: 84px; font-weight: 900; color: #ef4444; font-family: ui-monospace, monospace; line-height: 1; margin-bottom: 16px;">500</div>
    <h1 style="font-size: 24px; font-weight: 800; color: #ffffff; margin-bottom: 8px;">Internal Server Error</h1>
    <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6; margin-bottom: 24px;">An unexpected error occurred on the server. Please try again later.</p>
    <a href="/" style="display: inline-block; background: #27272a; color: #ffffff; font-weight: 600; font-size: 13px; padding: 10px 24px; border-radius: 10px; text-decoration: none;">&larr; Return Home</a>
  </div>
</body>
</html>`;
  }
}
