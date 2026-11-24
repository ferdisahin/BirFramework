import { escapeHtml, RawHtmlString } from './escape.js';
import type { JSXChild, JSXElement } from './types.js';

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const BOOLEAN_ATTRIBUTES = new Set([
  'allowfullscreen',
  'async',
  'autofocus',
  'autoplay',
  'checked',
  'controls',
  'default',
  'defer',
  'disabled',
  'formnovalidate',
  'hidden',
  'inert',
  'ismap',
  'itemscope',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
]);

export function isValidElement(val: any): val is JSXElement {
  return typeof val === 'object' && val !== null && val.__isBirJsx === true;
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function formatStyle(style: string | Record<string, string | number>): string {
  if (typeof style === 'string') return style;
  if (typeof style !== 'object' || style === null) return '';

  return Object.entries(style)
    .filter(([_, val]) => val !== undefined && val !== null && val !== '')
    .map(([key, val]) => `${camelToKebab(key)}:${val}`)
    .join(';');
}

function renderAttributes(props: Record<string, any>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || key === 'key' || key === 'dangerouslySetInnerHTML') {
      continue;
    }

    if (value === null || value === undefined || value === false) {
      continue;
    }

    let attrName = key;
    if (attrName === 'className') attrName = 'class';
    if (attrName === 'htmlFor') attrName = 'for';

    if (BOOLEAN_ATTRIBUTES.has(attrName.toLowerCase())) {
      if (value === true || value === 'true' || value === attrName) {
        parts.push(attrName);
      }
      continue;
    }

    if (attrName === 'style') {
      const styleStr = formatStyle(value);
      if (styleStr) {
        parts.push(`style="${escapeHtml(styleStr)}"`);
      }
      continue;
    }

    parts.push(`${attrName}="${escapeHtml(value)}"`);
  }

  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

/**
 * Synchronous rendering of JSX VNode to HTML string
 */
export function renderToString(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return escapeHtml(node);
  }

  if (node instanceof RawHtmlString || (typeof node === 'object' && node.isRawHtml)) {
    return node.__html;
  }

  if (Array.isArray(node)) {
    return node.map(renderToString).join('');
  }

  if (isValidElement(node)) {
    const { type, props } = node;

    // Fragment or null component
    if (!type) {
      return renderToString(props.children);
    }

    // Functional Component
    if (typeof type === 'function') {
      const res = type(props);
      return renderToString(res);
    }

    // HTML Tag
    if (typeof type === 'string') {
      const tagName = type.toLowerCase();
      const attrs = renderAttributes(props);

      if (VOID_ELEMENTS.has(tagName)) {
        return `<${tagName}${attrs} />`;
      }

      let innerHtml = '';
      if (props.dangerouslySetInnerHTML && typeof props.dangerouslySetInnerHTML.__html === 'string') {
        innerHtml = props.dangerouslySetInnerHTML.__html;
      } else if (props.children !== undefined) {
        innerHtml = renderToString(props.children);
      }

      return `<${tagName}${attrs}>${innerHtml}</${tagName}>`;
    }
  }

  return escapeHtml(String(node));
}

/**
 * Asynchronous rendering of JSX VNode to HTML string (supports async server components)
 */
export async function renderToHtml(node: any): Promise<string> {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }

  if (node instanceof Promise) {
    const resolved = await node;
    return renderToHtml(resolved);
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return escapeHtml(node);
  }

  if (node instanceof RawHtmlString || (typeof node === 'object' && node.isRawHtml)) {
    return node.__html;
  }

  if (Array.isArray(node)) {
    const parts = await Promise.all(node.map(renderToHtml));
    return parts.join('');
  }

  if (isValidElement(node)) {
    const { type, props } = node;

    if (!type) {
      return renderToHtml(props.children);
    }

    if (typeof type === 'function') {
      let res = type(props);
      if (res instanceof Promise) {
        res = await res;
      }
      return renderToHtml(res);
    }

    if (typeof type === 'string') {
      const tagName = type.toLowerCase();
      const attrs = renderAttributes(props);

      if (VOID_ELEMENTS.has(tagName)) {
        return `<${tagName}${attrs} />`;
      }

      let innerHtml = '';
      if (props.dangerouslySetInnerHTML && typeof props.dangerouslySetInnerHTML.__html === 'string') {
        innerHtml = props.dangerouslySetInnerHTML.__html;
      } else if (props.children !== undefined) {
        innerHtml = await renderToHtml(props.children);
      }

      return `<${tagName}${attrs}>${innerHtml}</${tagName}>`;
    }
  }

  return escapeHtml(String(node));
}
