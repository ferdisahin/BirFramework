import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { ComponentFunction, JSXChild, JSXElement } from './types.js';
import { renderToHtml, renderToString, isValidElement } from './render.js';
import { raw, RawHtmlString } from './escape.js';

export { renderToHtml, renderToString, isValidElement, raw, RawHtmlString };
export type { JSXChild, JSXElement, ComponentFunction };
export type { JSX } from './types.js';

/**
 * JSX Fragment component
 */
export function Fragment(props: { children?: any }) {
  return props.children;
}

/**
 * Modern React-JSX runtime factory: jsx() and jsxs()
 */
export function jsx(type: any, props: any, key?: string | number | null): JSXElement {
  return {
    type,
    props: props || {},
    key: key !== undefined ? key : props?.key,
    __isBirJsx: true,
  };
}

export const jsxs = jsx;
export const jsxDEV = jsx;

/**
 * Classic hyperscript factory: h(type, props, ...children)
 */
export function h(type: any, props?: any, ...children: any[]): JSXElement {
  const mergedProps = { ...(props || {}) };
  if (children.length === 1) {
    mergedProps.children = children[0];
  } else if (children.length > 1) {
    mergedProps.children = children;
  }
  return jsx(type, mergedProps);
}

/**
 * Vite asset tags component for JSX/TSX server-rendered templates
 */
export function Vite(props: { entries?: string | string[] }): JSXElement | JSXElement[] {
  const entries = Array.isArray(props.entries)
    ? props.entries
    : props.entries
    ? [props.entries]
    : [];
  const isDev = process.env.NODE_ENV !== 'production';
  const viteHost = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (isDev) {
    const devElements: JSXElement[] = [
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

  const prodElements: JSXElement[] = [];
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
