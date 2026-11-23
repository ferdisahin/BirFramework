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
    const safeMethod = ctx.method;
    const safePath = ctx.path;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404: Route Not Found | BirFramework</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #09090b;
      color: #f4f4f5;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      position: relative;
      overflow: hidden;
    }
    .ambient-glow {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -60%);
      width: 500px;
      height: 400px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.14) 0%, rgba(139, 92, 246, 0.05) 45%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .wrapper {
      position: relative;
      z-index: 1;
      max-width: 480px;
      text-align: center;
    }
    .brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
      font-weight: 600;
      color: #a1a1aa;
      margin-bottom: 24px;
      backdrop-filter: blur(8px);
    }
    .brand-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #6366f1;
      box-shadow: 0 0 8px #6366f1;
    }
    .error-code {
      font-size: 88px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.05em;
      background: linear-gradient(180deg, #ffffff 40%, #71717a 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 12px;
    }
    .error-title {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }
    .error-desc {
      font-size: 13px;
      color: #71717a;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .path-badge {
      display: inline-block;
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 8px;
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid rgba(99, 102, 241, 0.2);
      color: #818cf8;
      font-weight: 500;
      word-break: break-all;
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-top: 24px;
    }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 18px;
      border-radius: 10px;
      background: #ffffff;
      color: #09090b;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.15s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }
    .btn-primary:hover {
      background: #f4f4f5;
      transform: translateY(-1px);
    }
    .btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 9px 16px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #a1a1aa;
      font-size: 12px;
      font-weight: 500;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }
    .footer {
      margin-top: 48px;
      font-size: 11px;
      color: #52525b;
      letter-spacing: 0.02em;
    }
    @media (prefers-color-scheme: light) {
      body { background: #fafafa; color: #09090b; }
      .ambient-glow { background: radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 60%); }
      .brand-badge { background: #ffffff; border-color: #e4e4e7; color: #52525b; }
      .error-code { background: linear-gradient(180deg, #18181b 30%, #71717a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
      .error-title { color: #09090b; }
      .error-desc { color: #71717a; }
      .path-badge { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
      .btn-primary { background: #09090b; color: #ffffff; }
      .btn-primary:hover { background: #18181b; }
      .btn-secondary { background: #ffffff; border-color: #e4e4e7; color: #52525b; }
      .btn-secondary:hover { background: #f4f4f5; color: #09090b; }
      .footer { color: #a1a1aa; }
    }
  </style>
</head>
<body>
  <div class="ambient-glow"></div>
  <div class="wrapper">
    <div class="brand-badge">
      <span class="brand-dot"></span>
      BirFramework &bull; v${VERSION}
    </div>

    <div class="error-code">404</div>
    <h1 class="error-title">Route not found</h1>
    <p class="error-desc">No route registered for <span class="path-badge">${safeMethod} ${safePath}</span></p>

    <div class="actions">
      <a href="/" class="btn-primary">&larr; Return Home</a>
      <a href="https://birframework.dev" target="_blank" class="btn-secondary">Documentation &nearr;</a>
    </div>

    <div class="footer">
      BirFramework Full-Stack Runtime
    </div>
  </div>
</body>
</html>`;
  }

  private static renderBuiltin403(message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>403: Access Forbidden</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #fafafa;
      color: #000000;
      font-family: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
    }
    .container {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .code {
      display: inline-block;
      font-size: 38px;
      font-weight: 500;
      line-height: 49px;
      margin: 0 24px 0 0;
      padding-right: 24px;
      border-right: 1px solid rgba(0, 0, 0, 0.25);
    }
    .content {
      display: inline-block;
      text-align: left;
    }
    .title {
      font-size: 14px;
      font-weight: 400;
      line-height: 24px;
      margin: 0;
      color: #171717;
    }
    .links {
      margin-top: 6px;
      font-size: 13px;
      display: flex;
      gap: 12px;
    }
    .links a {
      color: #737373;
      text-decoration: none;
      transition: color 0.15s ease;
    }
    .links a:hover {
      color: #000000;
      text-decoration: underline;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #000000; color: #ffffff; }
      .code { border-right-color: rgba(255, 255, 255, 0.3); color: #ffffff; }
      .title { color: #ededed; }
      .links a { color: #888888; }
      .links a:hover { color: #ffffff; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="code">403</h1>
    <div class="content">
      <h2 class="title">${message || 'This action is unauthorized.'}</h2>
      <div class="links">
        <a href="/">Home</a>
        <a href="https://birframework.dev" target="_blank">Docs</a>
        <a href="https://github.com/ferdisahin/BirFramework" target="_blank">GitHub &nearr;</a>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  private static renderBuiltin500(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>500: Internal Server Error</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #fafafa;
      color: #000000;
      font-family: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
    }
    .container {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .code {
      display: inline-block;
      font-size: 38px;
      font-weight: 500;
      line-height: 49px;
      margin: 0 24px 0 0;
      padding-right: 24px;
      border-right: 1px solid rgba(0, 0, 0, 0.25);
    }
    .content {
      display: inline-block;
      text-align: left;
    }
    .title {
      font-size: 14px;
      font-weight: 400;
      line-height: 24px;
      margin: 0;
      color: #171717;
    }
    .links {
      margin-top: 6px;
      font-size: 13px;
      display: flex;
      gap: 12px;
    }
    .links a {
      color: #737373;
      text-decoration: none;
      transition: color 0.15s ease;
    }
    .links a:hover {
      color: #000000;
      text-decoration: underline;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #000000; color: #ffffff; }
      .code { border-right-color: rgba(255, 255, 255, 0.3); color: #ffffff; }
      .title { color: #ededed; }
      .links a { color: #888888; }
      .links a:hover { color: #ffffff; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="code">500</h1>
    <div class="content">
      <h2 class="title">Internal Server Error.</h2>
      <div class="links">
        <a href="/">Home</a>
        <a href="https://birframework.dev" target="_blank">Docs</a>
        <a href="https://github.com/ferdisahin/BirFramework" target="_blank">GitHub &nearr;</a>
      </div>
    </div>
  </div>
</body>
</html>`;
  }
}
