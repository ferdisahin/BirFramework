import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnv(envPath: string = resolve(process.cwd(), '.env')): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!existsSync(envPath)) {
    return parsed;
  }

  const content = readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    let val = trimmed.substring(eqIndex + 1).trim();

    // Strip wrapping quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }

    parsed[key] = val;
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }

  return parsed;
}

// Auto-load on import
loadEnv();
