import type { Context } from '../http/context.js';
import { Hash } from './hash.js';
import { Model } from '../database/model.js';
import { PersonalAccessToken } from './token.js';

export interface Credentials {
  email: string;
  password: string;
  [key: string]: any;
}

export class Auth {
  public static readonly sessionKey: string = 'auth_user_id';

  public static async login(ctx: Context, user: any): Promise<void> {
    if (!ctx.session) {
      throw new Error('[BirAuth] Session middleware is required to use Auth.login().');
    }
    const id = user.id || (user.attributes && user.attributes.id);
    ctx.session.set(this.sessionKey, id);
  }

  public static token(ctx: Context): PersonalAccessToken | null {
    return (ctx as any)?.token || null;
  }

  public static id(ctx: Context): any | null {
    const testHeader = ctx?.headers?.['x-bir-test-user'];
    if (testHeader && process.env.NODE_ENV === 'test') {
      return testHeader;
    }
    if ((ctx as any)?._bir_token_user_id !== undefined) {
      return (ctx as any)._bir_token_user_id;
    }
    if (!ctx || !ctx.session) return null;
    return ctx.session.get(this.sessionKey, ctx.session.get('user_id', null));
  }

  public static check(ctx: Context): boolean {
    return Boolean(this.id(ctx));
  }

  public static async authenticateToken(ctx: Context): Promise<PersonalAccessToken | null> {
    if ((ctx as any)?.token) {
      return (ctx as any).token;
    }
    const authHeader = ctx?.headers?.['authorization'] as string | undefined;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const plainToken = authHeader.substring(7).trim();
      const tokenRecord = await PersonalAccessToken.findToken(plainToken);
      if (tokenRecord) {
        (ctx as any).token = tokenRecord;
        (ctx as any)._bir_token_user_id = tokenRecord.tokenable_id;
        tokenRecord.last_used_at = new Date().toISOString();
        await tokenRecord.save().catch(() => {});
        return tokenRecord;
      }
    }
    return null;
  }

  public static async user<T = any>(ctx: Context, userModel?: typeof Model): Promise<T | null> {
    if (!this.check(ctx)) {
      await this.authenticateToken(ctx);
    }

    const id = this.id(ctx);
    if (!id) return null;

    if (userModel) {
      return (await userModel.find(id)) as T;
    }

    // Default fallback to query 'users' table
    return (await Model.where.call({ table: 'users', primaryKey: 'id', getTableName: () => 'users' } as any, 'id', '=', id).first()) as T;
  }

  public static async attempt(
    ctx: Context,
    credentials: Credentials,
    userModel: typeof Model
  ): Promise<boolean> {
    const user: any = await userModel.where('email', '=', credentials.email).first();
    if (!user) {
      return false;
    }

    const passwordHash = user.password || (user.attributes && user.attributes.password);
    if (!passwordHash || !Hash.check(credentials.password, passwordHash)) {
      return false;
    }

    await this.login(ctx, user);
    return true;
  }

  public static logout(ctx: Context): void {
    if (ctx.session) {
      ctx.session.remove(this.sessionKey);
      ctx.session.clear();
    }
    delete (ctx as any).token;
    delete (ctx as any)._bir_token_user_id;
  }
}
