import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Context } from '../http/context.js';
import type { Middleware } from '../router/middleware.js';

export type SharedPropResolver = any | ((ctx: Context) => any | Promise<any>);
export type SsrRendererFn = (component: string, props: Record<string, any>) => Promise<string> | string;

export interface InertiaRenderOptions {
  title?: string;
  statusCode?: number;
  ssr?: boolean;
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class InertiaManager {
  private sharedProps = new Map<string, SharedPropResolver>();
  private ssrRenderer: SsrRendererFn | null = null;
  private pagesDir: string = resolve(process.cwd(), 'views/pages');

  /**
   * Register a shared prop (or async resolver) automatically merged into all Inertia responses.
   */
  public share(key: string, value: SharedPropResolver): this {
    this.sharedProps.set(key, value);
    return this;
  }

  public setPagesDir(dir: string): this {
    this.pagesDir = resolve(dir);
    return this;
  }

  public setSsrRenderer(renderer: SsrRendererFn | null): this {
    this.ssrRenderer = renderer;
    return this;
  }

  public clearShared(): void {
    this.sharedProps.clear();
  }

  public async resolveSharedProps(ctx: Context): Promise<Record<string, any>> {
    const resolved: Record<string, any> = {};

    // Automatically expose session flash messages if session middleware is active
    if (ctx.session) {
      resolved.flash = {
        success: ctx.session.getFlash('success') ?? null,
        error: ctx.session.getFlash('error') ?? null,
        errors: ctx.session.getFlash('errors') ?? {},
      };
    }

    for (const [key, val] of this.sharedProps.entries()) {
      resolved[key] = typeof val === 'function' ? await val(ctx) : val;
    }

    return resolved;
  }

  /**
   * Middleware for global Inertia Vary header and automatic flash sharing.
   */
  public middleware(): Middleware {
    return async (ctx, next) => {
      ctx.header('Vary', 'X-Bir-Inertia');
      await next();
    };
  }

  /**
   * Render an Inertia page:
   * - Returns JSON `{ component, props, url }` when `X-Bir-Inertia: true` header is present.
   * - Returns full SSR + Hydration HTML shell on initial browser load.
   */
  public async render(
    ctx: Context,
    component: string,
    props: Record<string, any> = {},
    options: InertiaRenderOptions = {}
  ): Promise<void> {
    const shared = await this.resolveSharedProps(ctx);
    const mergedProps = { ...shared, ...props };
    const pageObject = {
      component,
      props: mergedProps,
      url: ctx.url || ctx.path,
    };

    const isInertiaRequest = ctx.headers['x-bir-inertia'] === 'true';
    ctx.header('Vary', 'X-Bir-Inertia');

    if (isInertiaRequest) {
      ctx.header('X-Bir-Inertia', 'true');
      ctx.json(pageObject, options.statusCode || 200);
      return;
    }

    // Initial browser load: Attempt SSR if configured or preact-render-to-string is available
    let ssrHtml = '';
    if (options.ssr !== false) {
      ssrHtml = await this.tryRenderSsr(component, mergedProps);
    }

    const title = escapeHtmlAttr(options.title || String(mergedProps.title || 'BirJS'));
    const encodedPage = escapeHtmlAttr(JSON.stringify(pageObject));
    const headAssets = this.renderViteTags(['resources/css/app.css', 'resources/js/app.tsx']);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  ${headAssets}
</head>
<body class="bg-[#09090b] text-zinc-100 min-h-screen font-sans antialiased selection:bg-zinc-800 selection:text-white">
  <div id="app" data-page="${encodedPage}">${ssrHtml}</div>
</body>
</html>`;

    ctx.html(html, options.statusCode || 200);
  }

  /**
   * Trigger a full client-side redirect from an Inertia request.
   */
  public location(ctx: Context, url: string): void {
    if (ctx.headers['x-bir-inertia'] === 'true') {
      ctx.header('X-Bir-Inertia-Location', url);
      ctx.status(409).text('');
      return;
    }
    ctx.redirect(url);
  }

  private async tryRenderSsr(component: string, props: Record<string, any>): Promise<string> {
    if (this.ssrRenderer) {
      try {
        return await this.ssrRenderer(component, props);
      } catch {
        return '';
      }
    }

    if (!component || component.includes('\0') || component.includes('..')) {
      return '';
    }

    const safeRel = component.replace(/\./g, '/').replace(/^\/+/, '');
    const candidates = [
      resolve(this.pagesDir, `${safeRel}.tsx`),
      resolve(this.pagesDir, `${safeRel}.jsx`),
    ];

    const pageFile = candidates.find((p) => p.startsWith(this.pagesDir + sep) && existsSync(p));
    if (!pageFile) return '';

    try {
      const preactPkg = 'preact';
      const preactSsrPkg = 'preact-render-to-string';
      const [{ h }, { renderToString }] = await Promise.all([
        import(/* @vite-ignore */ preactPkg) as Promise<any>,
        import(/* @vite-ignore */ preactSsrPkg) as Promise<any>,
      ]);
      const mod = await import(pathToFileURL(pageFile).href);
      const PageComponent = mod.default || Object.values(mod).find((v) => typeof v === 'function');
      if (typeof PageComponent !== 'function') return '';
      return renderToString(h(PageComponent, props));
    } catch {
      // Fallback gracefully to client-side mount if preact/SSR is not installed
      return '';
    }
  }

  private renderViteTags(entries: string[]): string {
    const isDev = process.env.NODE_ENV !== 'production';
    const viteHost = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

    if (isDev) {
      const tags = [`<script type="module" src="${viteHost}/@vite/client"></script>`];
      for (const entry of entries) {
        if (entry.endsWith('.css')) {
          tags.push(`<link rel="stylesheet" href="${viteHost}/${entry}" />`);
        } else {
          tags.push(`<script type="module" src="${viteHost}/${entry}"></script>`);
        }
      }
      return tags.join('\n  ');
    }

    const manifestPath = join(process.cwd(), 'public', 'build', 'manifest.json');
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const tags: string[] = [];
        for (const entry of entries) {
          const chunk = manifest[entry];
          if (chunk) {
            if (chunk.file.endsWith('.css')) {
              tags.push(`<link rel="stylesheet" href="/build/${chunk.file}" />`);
            } else {
              tags.push(`<script type="module" src="/build/${chunk.file}"></script>`);
            }
            if (Array.isArray(chunk.css)) {
              for (const cssFile of chunk.css) {
                tags.push(`<link rel="stylesheet" href="/build/${cssFile}" />`);
              }
            }
          }
        }
        return tags.join('\n  ');
      } catch {
        // fall through
      }
    }

    return `<link rel="stylesheet" href="/css/app.css" />`;
  }
}

export const Inertia = new InertiaManager();
