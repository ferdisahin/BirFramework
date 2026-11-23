import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

export interface TranslatorOptions {
  locale?: string;
  fallbackLocale?: string;
  langDir?: string;
}

export class Translator {
  private locale: string;
  private fallbackLocale: string;
  private langDir: string;
  private translations = new Map<string, Record<string, any>>();
  private loaded: boolean = false;

  constructor(options: TranslatorOptions = {}) {
    this.locale = options.locale || process.env.APP_LOCALE || 'en';
    this.fallbackLocale = options.fallbackLocale || 'en';
    this.langDir = options.langDir || this.detectLangDir();
  }

  private detectLangDir(): string {
    const candidates = [
      resolve(process.cwd(), 'lang'),
      resolve(process.cwd(), 'resources/lang'),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return candidates[0]!;
  }

  public setLocale(locale: string): this {
    this.locale = locale;
    return this;
  }

  public getLocale(): string {
    return this.locale;
  }

  public setFallbackLocale(locale: string): this {
    this.fallbackLocale = locale;
    return this;
  }

  public getFallbackLocale(): string {
    return this.fallbackLocale;
  }

  /**
   * Add in-memory translation key-values for a given locale.
   */
  public addLines(locale: string, lines: Record<string, any>): this {
    if (!this.translations.has(locale)) {
      this.translations.set(locale, {});
    }
    const current = this.translations.get(locale)!;
    this.translations.set(locale, { ...current, ...lines });
    return this;
  }

  /**
   * Load JSON translations from the configured lang directory if present.
   */
  public load(): void {
    if (this.loaded) return;
    this.loaded = true;

    if (!existsSync(this.langDir)) return;

    try {
      const files = readdirSync(this.langDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const locale = file.replace(/\.json$/, '');
          const filePath = join(this.langDir, file);
          try {
            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);
            this.addLines(locale, data);
          } catch {
            // ignore malformed JSON file
          }
        }
      }
    } catch {
      // directory read failure
    }
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    const parts = path.split('.');
    let curr = obj;
    for (const p of parts) {
      if (curr && typeof curr === 'object' && p in curr) {
        curr = curr[p];
      } else {
        return undefined;
      }
    }
    return curr;
  }

  /**
   * Translate a key into the current or specified locale.
   */
  public get(key: string, replace: Record<string, any> = {}, locale?: string): string {
    this.load();
    const targetLocale = locale || this.locale;

    let line = this.findLine(targetLocale, key);

    // Fallback if not found in target locale
    if (line === undefined && targetLocale !== this.fallbackLocale) {
      line = this.findLine(this.fallbackLocale, key);
    }

    if (line === undefined) {
      line = key;
    }

    return this.interpolate(String(line), replace);
  }

  private findLine(locale: string, key: string): any {
    const dict = this.translations.get(locale);
    if (!dict) return undefined;

    // Direct key match
    if (key in dict) {
      return dict[key];
    }

    // Dot notation match (e.g. auth.failed -> dict.auth.failed)
    return this.getNestedValue(dict, key);
  }

  private interpolate(line: string, replace: Record<string, any>): string {
    let result = line;
    for (const [k, v] of Object.entries(replace)) {
      // Replaces both :key and {key}
      const val = String(v);
      result = result
        .replace(new RegExp(`:${k}\\b`, 'g'), val)
        .replace(new RegExp(`\\{${k}\\}`, 'g'), val);
    }
    return result;
  }

  public has(key: string, locale?: string): boolean {
    this.load();
    const targetLocale = locale || this.locale;
    return this.findLine(targetLocale, key) !== undefined;
  }
}

// Global default singleton
export const translator = new Translator();

// Global helper function `__()`
export function __(key: string, replace: Record<string, any> = {}, locale?: string): string {
  return translator.get(key, replace, locale);
}

// Static Facade
export class Lang {
  public static get(key: string, replace: Record<string, any> = {}, locale?: string): string {
    return translator.get(key, replace, locale);
  }

  public static has(key: string, locale?: string): boolean {
    return translator.has(key, locale);
  }

  public static setLocale(locale: string): Translator {
    return translator.setLocale(locale);
  }

  public static getLocale(): string {
    return translator.getLocale();
  }

  public static addLines(locale: string, lines: Record<string, any>): Translator {
    return translator.addLines(locale, lines);
  }
}
