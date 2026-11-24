import { AuthorizationError } from '../validation/form-request.js';
import type { Middleware } from '../router/middleware.js';
import type { Context } from '../http/context.js';
import { Auth } from './auth.js';

export type GateCallback = (user: any, ...args: any[]) => boolean | Promise<boolean>;
export type GateBeforeCallback = (user: any, ability: string) => boolean | undefined | null | Promise<boolean | undefined | null>;

export class Gate {
  private static abilities = new Map<string, GateCallback>();
  private static beforeCallbacks: GateBeforeCallback[] = [];

  /**
   * Register a global before-callback (e.g., super-admin bypass).
   * Returning true/false short-circuits; returning null/undefined falls through to ability rules.
   */
  public static before(callback: GateBeforeCallback): void {
    this.beforeCallbacks.push(callback);
  }

  /**
   * Define an authorization ability rule.
   */
  public static define(ability: string, callback: GateCallback): void {
    this.abilities.set(ability, callback);
  }

  /**
   * Determine if the given user is allowed to perform the ability.
   */
  public static async allows(ability: string, user: any, ...args: any[]): Promise<boolean> {
    for (const cb of this.beforeCallbacks) {
      const result = await cb(user, ability);
      if (result === true) return true;
      if (result === false) return false;
    }

    const handler = this.abilities.get(ability);
    if (!handler) return false;

    return Boolean(await handler(user, ...args));
  }

  /**
   * Determine if the given user is denied from performing the ability.
   */
  public static async denies(ability: string, user: any, ...args: any[]): Promise<boolean> {
    return !(await this.allows(ability, user, ...args));
  }

  /**
   * Authorize an ability or throw AuthorizationError (HTTP 403).
   */
  public static async authorize(ability: string, user: any, ...args: any[]): Promise<void> {
    const allowed = await this.allows(ability, user, ...args);
    if (!allowed) {
      throw new AuthorizationError(`This action is unauthorized [${ability}].`);
    }
  }

  /**
   * Clear all registered abilities and before-callbacks (useful in tests).
   */
  public static clear(): void {
    this.abilities.clear();
    this.beforeCallbacks = [];
  }
}

/**
 * Route middleware to authorize the currently authenticated user against a Gate ability.
 * Example: Route.delete('/invoices/:id', handler).middleware(can('delete-invoice'));
 */
export function can(ability: string, ...args: any[]): Middleware {
  return async (ctx: Context, next) => {
    const user = await Auth.user(ctx);
    await Gate.authorize(ability, user, ...args);
    await next();
  };
}
