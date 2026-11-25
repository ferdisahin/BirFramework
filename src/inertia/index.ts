import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Context } from '../http/context.js';
import type { Middleware } from '../router/middleware.js';

export type SharedPropResolver = any | ((ctx: Context) => any | Promise<any>);
export type SsrRendererFn = (component: string, props: Record<string, any>) => Promise<string> | string;

export interface InertiaMetaTag {
  name?: string;
  property?: string;
  content: string;
}

export interface InertiaMetaOptions {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  og?: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
    siteName?: string;
  };
  twitter?: {
    card?: string;
    title?: string;
    description?: string;
    image?: string;
    site?: string;
  };
  tags?: InertiaMetaTag[];
}

export interface InertiaRenderOptions {
  title?: string;
  description?: string;
  canonical?: string;
  lang?: string;
  meta?: InertiaMetaOptions;
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
  private cachedManifestTags: Map<string, string> = new Map();
  private cachedSsrModules: Map<string, any | null> = new Map();
  private cachedPreactSsr: Promise<[any, any] | null> | null = null;

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

    const meta: InertiaMetaOptions = {
      ...(typeof mergedProps.meta === 'object' && mergedProps.meta ? mergedProps.meta : {}),
      ...(options.meta || {}),
    };
    const rawTitle = options.title || meta.title || (mergedProps.title ? String(mergedProps.title) : 'BirJS');
    const rawDescription =
      options.description || meta.description || (mergedProps.description ? String(mergedProps.description) : undefined);
    const rawCanonical = options.canonical || meta.canonical;
    const lang = escapeHtmlAttr(options.lang || 'en');

    const title = escapeHtmlAttr(rawTitle);
    const metaTagsHtml = this.renderMetaTags(rawTitle, rawDescription, rawCanonical, meta);
    const encodedPage = escapeHtmlAttr(JSON.stringify(pageObject));
    const headAssets = this.renderViteTags(['resources/css/app.css', 'resources/js/app.tsx']);

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>${metaTagsHtml}
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

  private renderMetaTags(
    title: string,
    description: string | undefined,
    canonical: string | undefined,
    meta: InertiaMetaOptions
  ): string {
    const tags: string[] = [];
    const addMeta = (attr: 'name' | 'property', key: string, value?: string) => {
      if (value) {
        tags.push(`  <meta ${attr}="${escapeHtmlAttr(key)}" content="${escapeHtmlAttr(value)}" />`);
      }
    };

    addMeta('name', 'description', description);
    addMeta('name', 'robots', meta.robots);
    if (canonical) {
      tags.push(`  <link rel="canonical" href="${escapeHtmlAttr(canonical)}" />`);
    }

    if (meta.og) {
      addMeta('property', 'og:title', meta.og.title ?? title);
      addMeta('property', 'og:description', meta.og.description ?? description);
      addMeta('property', 'og:image', meta.og.image);
      addMeta('property', 'og:url', meta.og.url ?? canonical);
      addMeta('property', 'og:type', meta.og.type ?? 'website');
      addMeta('property', 'og:site_name', meta.og.siteName);
    }

    if (meta.twitter) {
      addMeta('name', 'twitter:card', meta.twitter.card ?? 'summary_large_image');
      addMeta('name', 'twitter:title', meta.twitter.title ?? title);
      addMeta('name', 'twitter:description', meta.twitter.description ?? description);
      addMeta('name', 'twitter:image', meta.twitter.image);
      addMeta('name', 'twitter:site', meta.twitter.site);
    }

    if (Array.isArray(meta.tags)) {
      for (const tag of meta.tags) {
        if (!tag?.content) continue;
        if (tag.name) addMeta('name', tag.name, tag.content);
        else if (tag.property) addMeta('property', tag.property, tag.content);
      }
    }

    return tags.length > 0 ? '\n' + tags.join('\n') : '';
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
    const isProd = process.env.NODE_ENV === 'production';

    if (isProd && this.cachedSsrModules.has(safeRel)) {
      const cached = this.cachedSsrModules.get(safeRel);
      if (!cached) return '';
      try {
        const preactPair = await this.getPreactSsr();
        if (!preactPair) return '';
        const [{ h }, { renderToString }] = preactPair;
        return renderToString(this.wrapWithLayout(h, cached, props));
      } catch {
        return '';
      }
    }

    const candidates = [
      resolve(this.pagesDir, `${safeRel}.tsx`),
      resolve(this.pagesDir, `${safeRel}.jsx`),
    ];

    const pageFile = candidates.find((p) => p.startsWith(this.pagesDir + sep) && existsSync(p));
    if (!pageFile) {
      if (isProd) this.cachedSsrModules.set(safeRel, null);
      return '';
    }

    try {
      const preactPair = await this.getPreactSsr();
      if (!preactPair) return '';
      const [{ h }, { renderToString }] = preactPair;
      const mod = await import(pathToFileURL(pageFile).href);
      const PageComponent = mod.default || Object.values(mod).find((v) => typeof v === 'function');
      if (typeof PageComponent !== 'function') {
        if (isProd) this.cachedSsrModules.set(safeRel, null);
        return '';
      }
      if (isProd) this.cachedSsrModules.set(safeRel, PageComponent);
      return renderToString(this.wrapWithLayout(h, PageComponent, props));
    } catch {
      if (isProd) this.cachedSsrModules.set(safeRel, null);
      // Fallback gracefully to client-side mount if preact/SSR is not installed
      return '';
    }
  }

  private wrapWithLayout(h: any, PageComponent: any, props: Record<string, any>): any {
    const pageEl = h(PageComponent, props);
    if (typeof PageComponent?.layout === 'function') {
      return PageComponent.layout(pageEl, props);
    }
    if (Array.isArray(PageComponent?.layout)) {
      return PageComponent.layout.reduceRight(
        (acc: any, Layout: any) => h(Layout, props, acc),
        pageEl
      );
    }
    return pageEl;
  }

  private getPreactSsr(): Promise<[any, any] | null> {
    if (!this.cachedPreactSsr) {
      const preactPkg = 'preact';
      const preactSsrPkg = 'preact-render-to-string';
      this.cachedPreactSsr = Promise.all([
        import(/* @vite-ignore */ preactPkg) as Promise<any>,
        import(/* @vite-ignore */ preactSsrPkg) as Promise<any>,
      ]).catch(() => null);
    }
    return this.cachedPreactSsr;
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

    const cacheKey = entries.join('|');
    const cached = this.cachedManifestTags.get(cacheKey);
    if (cached) return cached;

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
        const joined = tags.join('\n  ');
        this.cachedManifestTags.set(cacheKey, joined);
        return joined;
      } catch {
        // fall through
      }
    }

    return `<link rel="stylesheet" href="/css/app.css" />`;
  }
}

export const Inertia = new InertiaManager();
