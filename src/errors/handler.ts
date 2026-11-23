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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404: This page could not be found.</title>
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
    <h1 class="code">404</h1>
    <div class="content">
      <h2 class="title">This page could not be found.</h2>
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
