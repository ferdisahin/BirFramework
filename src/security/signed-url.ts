import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Middleware } from '../router/middleware.js';
import type { Context } from '../http/context.js';

export class SignedUrl {
  private static getSecret(customSecret?: string): string {
    const key = customSecret ?? process.env.APP_KEY;
    if (!key || key.trim().length === 0) {
      throw new Error('[BirSecurity] APP_KEY is required to sign or verify URLs.');
    }
    return key;
  }

  /**
   * Generate an HMAC-SHA256 signed URL (with optional expiration in seconds).
   */
  public static sign(urlOrPath: string, expiresInSeconds?: number, customSecret?: string): string {
    const secret = this.getSecret(customSecret);
    const isAbsolute = /^https?:\/\//i.test(urlOrPath);
    const parsed = new URL(urlOrPath, 'http://localhost');

    if (expiresInSeconds !== undefined) {
      const expiresAt = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(expiresInSeconds));
      parsed.searchParams.set('expires', String(expiresAt));
    }

    // Sign pathname + sorted query params (excluding signature)
    const canonical = this.canonicalTarget(parsed);
    const signature = createHmac('sha256', secret).update(canonical).digest('hex');
    parsed.searchParams.set('signature', signature);

    return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  }

  /**
   * Verify a signed URL's HMAC signature and expiration timestamp.
   */
  public static verify(urlOrPath: string, customSecret?: string): boolean {
    let secret: string;
    try {
      secret = this.getSecret(customSecret);
    } catch {
      return false;
    }

    let parsed: URL;
    try {
      parsed = new URL(urlOrPath, 'http://localhost');
    } catch {
      return false;
    }

    const sig = parsed.searchParams.get('signature');
    if (!sig) return false;

    const expires = parsed.searchParams.get('expires');
    if (expires !== null) {
      const expiresNum = Number(expires);
      if (!Number.isFinite(expiresNum) || Math.floor(Date.now() / 1000) > expiresNum) {
        return false;
      }
    }

    const canonical = this.canonicalTarget(parsed);
    const expected = createHmac('sha256', secret).update(canonical).digest('hex');

    const bufA = Buffer.from(sig, 'utf8');
    const bufB = Buffer.from(expected, 'utf8');
    if (bufA.length !== bufB.length) return false;

    return timingSafeEqual(bufA, bufB);
  }

  private static canonicalTarget(parsed: URL): string {
    const entries = [...parsed.searchParams.entries()]
      .filter(([k]) => k !== 'signature')
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = new URLSearchParams(entries).toString();
    return qs ? `${parsed.pathname}?${qs}` : parsed.pathname;
  }
}

/**
 * Route middleware rejecting requests without a valid HMAC signed URL (HTTP 403).
 */
export function signed(customSecret?: string): Middleware {
  return async (ctx: Context, next) => {
    if (!SignedUrl.verify(ctx.url, customSecret)) {
      return ctx.json({ error: 'Invalid or expired signature.' }, 403);
    }
    await next();
  };
}
