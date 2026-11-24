/**
 * HTML Escaping & Raw String utilities for BirJS JSX
 */

const ESCAPE_REGEX = /[&<>"']/g;
const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export class RawHtmlString {
  public readonly __html: string;
  public readonly isRawHtml = true;

  constructor(html: string) {
    this.__html = html;
  }

  public toString(): string {
    return this.__html;
  }
}

/**
 * Mark a string as safe raw HTML that should not be escaped.
 */
export function raw(html: string | number): RawHtmlString {
  return new RawHtmlString(String(html));
}

/**
 * Escape unsafe HTML characters in a string.
 */
export function escapeHtml(value: any): string {
  if (value === null || value === undefined) return '';
  if (value instanceof RawHtmlString || (typeof value === 'object' && value.isRawHtml)) {
    return value.__html;
  }
  const str = String(value);
  return str.replace(ESCAPE_REGEX, (char) => ESCAPE_MAP[char] || char);
}
