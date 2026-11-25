import crypto from 'node:crypto';
import { Model } from '../database/model.js';

export interface NewAccessToken {
  accessToken: PersonalAccessToken;
  plainTextToken: string;
}

export interface CreateTokenOptions {
  name: string;
  abilities?: string[];
  expiresAt?: Date | string | null;
}

export class PersonalAccessToken extends Model {
  public static override table = 'personal_access_tokens';

  public can(ability: string): boolean {
    const abilities = this.getAbilities();
    if (abilities.includes('*')) return true;
    return abilities.includes(ability);
  }

  public cant(ability: string): boolean {
    return !this.can(ability);
  }

  public getAbilities(): string[] {
    const raw = this.attributes.abilities;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  public static async createToken(
    tokenable: any,
    name: string,
    abilities: string[] = ['*'],
    expiresAt?: Date | string | null
  ): Promise<NewAccessToken> {
    const entropy = crypto.randomBytes(32).toString('hex');
    const plainTextToken = `bir_pat_${entropy}`;
    const hashedToken = this.hashToken(plainTextToken);
    const tokenableId = tokenable?.id ?? (tokenable?.attributes && tokenable.attributes.id);
    const tokenableType = tokenable?.constructor?.name || 'User';

    const accessToken = await this.create({
      tokenable_type: tokenableType,
      tokenable_id: tokenableId,
      name,
      token: hashedToken,
      abilities: JSON.stringify(abilities),
      expires_at: expiresAt ? (expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt) : null,
      last_used_at: null,
    });

    return {
      accessToken,
      plainTextToken,
    };
  }

  public static async findToken(plainTextToken: string): Promise<PersonalAccessToken | null> {
    if (!plainTextToken || typeof plainTextToken !== 'string') {
      return null;
    }
    const cleanToken = plainTextToken.trim();
    if (!cleanToken.startsWith('bir_pat_')) {
      return null;
    }

    const hashed = this.hashToken(cleanToken);
    const token = await this.where('token', '=', hashed).first();
    if (!token) return null;

    if (token.expires_at) {
      const expiry = new Date(token.expires_at).getTime();
      if (!isNaN(expiry) && Date.now() > expiry) {
        return null;
      }
    }

    return token;
  }
}

/**
 * Mixin to equip Eloquent models with Laravel Sanctum style API token generation
 */
export function HasApiTokens<TBase extends new (...args: any[]) => any>(Base: TBase) {
  return class extends Base {
    public async createToken(name: string, abilities: string[] = ['*'], expiresAt?: Date | string | null): Promise<NewAccessToken> {
      return PersonalAccessToken.createToken(this, name, abilities, expiresAt);
    }

    public async tokens(): Promise<PersonalAccessToken[]> {
      const id = (this as any).id || (this as any).attributes?.id;
      return PersonalAccessToken.where('tokenable_id', '=', id).get();
    }
  };
}
