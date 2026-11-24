import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context } from '../http/context.js';

export const requestContextStorage = new AsyncLocalStorage<Context>();

/**
 * Retrieve the active HTTP Request Context within the current async execution scope.
 */
export function getCurrentContext(): Context | undefined {
  return requestContextStorage.getStore();
}
