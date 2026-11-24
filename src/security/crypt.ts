import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export class CryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptError';
  }
}

export class Crypt {
  private static getKey(customKey?: string): Buffer {
    const raw = customKey ?? process.env.APP_KEY;
    if (!raw || raw.trim().length === 0) {
      throw new CryptError(
        '[BirCrypt] APP_KEY is not set. Run "npx bir key:generate" or set process.env.APP_KEY.'
      );
    }

    const material = raw.startsWith('base64:')
      ? Buffer.from(raw.slice(7), 'base64')
      : Buffer.from(raw, 'utf-8');

    // Derive deterministic 32-byte AES-256 key
    return material.length === 32 ? material : createHash('sha256').update(material).digest();
  }

  /**
   * Encrypt a string or JSON-serializable value using AES-256-GCM.
   */
  public static encrypt(value: string | number | boolean | object, customKey?: string): string {
    const key = this.getKey(customKey);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payload = {
      v: 1,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64'),
      json: typeof value !== 'string',
    };

    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  /**
   * Decrypt an AES-256-GCM encrypted payload.
   */
  public static decrypt<T = string>(token: string, customKey?: string): T {
    if (!token || typeof token !== 'string') {
      throw new CryptError('[BirCrypt] Invalid encrypted payload.');
    }

    let parsed: { v?: number; iv?: string; tag?: string; data?: string; json?: boolean };
    try {
      const jsonStr = Buffer.from(token, 'base64url').toString('utf8');
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new CryptError('[BirCrypt] Malformed encrypted payload.');
    }

    if (parsed.v !== 1 || !parsed.iv || !parsed.tag || typeof parsed.data !== 'string') {
      throw new CryptError('[BirCrypt] Unsupported or corrupted payload structure.');
    }

    try {
      const key = this.getKey(customKey);
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(parsed.data, 'base64')),
        decipher.final(),
      ]).toString('utf8');

      return (parsed.json ? JSON.parse(decrypted) : decrypted) as T;
    } catch {
      throw new CryptError('[BirCrypt] Decryption failed. Invalid APP_KEY or tampered payload.');
    }
  }
}
