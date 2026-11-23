import type { Context } from '../http/context.js';

export type Next = () => Promise<void> | void;
export type Middleware = (ctx: Context, next: Next) => Promise<any> | any;
export type RouteHandler = (ctx: Context) => Promise<any> | any;
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'ALL';
