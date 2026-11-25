import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { h, type VNode } from 'preact';
import { getCurrentContext } from '../core/request-context.js';
import { csrfToken } from '../security/csrf.js';

/**
 * Vite asset tags component for JSX/TSX server-rendered templates
 */
export function Vite(props: { entries?: string | string[] }): VNode<any> | VNode<any>[] {
  const entries = Array.isArray(props.entries)
    ? props.entries
    : props.entries
    ? [props.entries]
    : [];
  const isDev = process.env.NODE_ENV !== 'production';
  const viteHost = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (isDev) {
    const devElements: VNode<any>[] = [
      h('script', { type: 'module', src: `${viteHost}/@vite/client` }),
    ];
    for (const entry of entries) {
      if (entry.endsWith('.css')) {
        devElements.push(h('link', { rel: 'stylesheet', href: `${viteHost}/${entry}` }));
      } else {
        devElements.push(h('script', { type: 'module', src: `${viteHost}/${entry}` }));
      }
    }
    return devElements;
  }

  // Production build: Check for public/build/manifest.json
  const manifestPath = join(process.cwd(), 'public', 'build', 'manifest.json');
  let manifest: Record<string, { file: string; css?: string[] }> = {};
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch {
      // ignore
    }
  }

  const prodElements: VNode<any>[] = [];
  for (const entry of entries) {
    const chunk = manifest[entry];
    if (chunk) {
      if (chunk.file.endsWith('.css')) {
        prodElements.push(h('link', { rel: 'stylesheet', href: `/build/${chunk.file}` }));
      } else {
        prodElements.push(h('script', { type: 'module', src: `/build/${chunk.file}` }));
      }
      if (chunk.css && Array.isArray(chunk.css)) {
        for (const cssFile of chunk.css) {
          prodElements.push(h('link', { rel: 'stylesheet', href: `/build/${cssFile}` }));
        }
      }
    } else {
      prodElements.push(
        h(entry.endsWith('.css') ? 'link' : 'script', {
          rel: entry.endsWith('.css') ? 'stylesheet' : undefined,
          href: entry.endsWith('.css') ? `/${entry}` : undefined,
          type: entry.endsWith('.css') ? undefined : 'module',
          src: entry.endsWith('.css') ? undefined : `/${entry}`,
        })
      );
    }
  }

  return prodElements;
}

/**
 * Render a hidden CSRF protection input (<input type="hidden" name="_token" value="..." />)
 */
export function Csrf(props: { token?: string } = {}): VNode<any> {
  const ctx = getCurrentContext();
  const token = props.token ?? (ctx?.session ? csrfToken(ctx) : '');
  return h('input', { type: 'hidden', name: '_token', value: token });
}

/**
 * Render a hidden HTTP method spoofing input (<input type="hidden" name="_method" value="PUT|PATCH|DELETE" />)
 */
export function Method(props: { method: 'PUT' | 'PATCH' | 'DELETE' | string }): VNode<any> {
  return h('input', { type: 'hidden', name: '_method', value: String(props.method || 'POST').toUpperCase() });
}

/**
 * Render validation error message for a specific form field from session flash errors
 */
export function ErrorMessage(props: { field: string; message?: string; className?: string }): VNode<any> | null {
  const ctx = getCurrentContext();
  const errors = ctx?.session?.getFlash<Record<string, string | string[]>>('errors');
  const fieldErr = props.message ?? errors?.[props.field];
  if (!fieldErr) return null;

  const text = Array.isArray(fieldErr) ? fieldErr[0] : fieldErr;
  if (!text) return null;

  return h('p', { className: props.className || 'text-xs text-red-500 mt-1' }, text);
}

/**
 * Render session flash status/alert banner (success, error, warning, info)
 */
export function Flash(props: {
  type?: 'success' | 'error' | 'warning' | 'info';
  message?: string;
  className?: string;
} = {}): VNode<any> | null {
  const type = props.type || 'success';
  const ctx = getCurrentContext();
  const message = props.message ?? ctx?.session?.getFlash<string>(type);
  if (!message) return null;

  const defaultStyles: Record<string, string> = {
    success: 'p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs',
    error: 'p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs',
    warning: 'p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs',
    info: 'p-3 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400 text-xs',
  };

  return h('div', { className: props.className || defaultStyles[type] || defaultStyles.info, role: 'alert' }, message);
}
