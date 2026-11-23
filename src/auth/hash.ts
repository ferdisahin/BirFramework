import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export class Hash {
  /**
   * Hashes a plain password using memory-hard scrypt with a cryptographic salt.
   */
  public static make(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = scryptSync(password, salt, 64);
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
  }

  /**
   * Constant-time verification to prevent timing attacks.
   */
  public static check(password: string, hashedValue: string): boolean {
    if (!hashedValue || !hashedValue.startsWith('scrypt:')) {
      return false;
    }

    const [, salt, originalHex] = hashedValue.split(':');
    if (!salt || !originalHex) {
      return false;
    }

    const derivedKey = scryptSync(password, salt, 64);
    const originalBuffer = Buffer.from(originalHex, 'hex');

    if (derivedKey.length !== originalBuffer.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, originalBuffer);
  }
}
