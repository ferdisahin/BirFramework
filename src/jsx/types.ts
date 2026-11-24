/**
 * Type definitions for BirJS JSX runtime
 */

export type JSXChild =
  | string
  | number
  | boolean
  | null
  | undefined
  | JSXElement
  | Promise<any>
  | JSXChild[];

export type ComponentFunction<P = any> = (props: P) => any;

export interface JSXElement<P = any> {
  type: string | ComponentFunction<P>;
  props: P & { children?: any };
  key?: string | number | null;
  __isBirJsx: true;
}

export declare namespace JSX {
  export type Element = JSXElement | Promise<any> | any;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicAttributes {
    key?: string | number | null;
  }

  export interface HTMLAttributes {
    class?: string;
    className?: string;
    id?: string;
    style?: string | Record<string, string | number>;
    title?: string;
    role?: string;
    tabIndex?: number | string;
    lang?: string;
    hidden?: boolean;
    slot?: string;
    dangerouslySetInnerHTML?: { __html: string };
    [key: `data-${string}`]: any;
    [key: `aria-${string}`]: any;
    children?: any;
    onClick?: string;
    onSubmit?: string;
    onChange?: string;
    onInput?: string;
    [key: string]: any;
  }

  export interface IntrinsicElements {
    [elemName: string]: HTMLAttributes;
  }
}
