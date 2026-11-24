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
