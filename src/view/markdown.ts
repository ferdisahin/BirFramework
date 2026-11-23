/**
 * Lightweight, zero-dependency Markdown to HTML compiler for BirFramework Blade Engine
 */
export function parseMarkdown(markdown: string): string {
  if (!markdown) return '';

  let html = markdown;

  // 1. Normalize line endings
  html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Fenced Code Blocks: ```lang ... ``` or ````lang ... ````
  const codeBlocks: string[] = [];
  html = html.replace(/^[ \t]*(`{3,}|~{3,})([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)\r?\n?[ \t]*\1/gm, (_, fence, lang, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const langAttr = lang ? ` class="language-${lang.trim()}"` : '';
    const placeholder = `%%BIRCODEBLOCK${codeBlocks.length}%%`;
    codeBlocks.push(`<pre><code${langAttr}>${escaped}</code></pre>`);
    return placeholder;
  });

  // 3. Inline Code: `code`
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const placeholder = `%%BIRINLINECODE${inlineCodes.length}%%`;
    inlineCodes.push(`<code>${escaped}</code>`);
    return placeholder;
  });

  // 4. Horizontal Rules: --- or ***
  html = html.replace(/^[ \t]*(?:---|\*\*\*|___)\s*$/gm, '<hr />');

  // 5. Headings: # H1 to ###### H6
  html = html.replace(/^[ \t]*######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^[ \t]*#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^[ \t]*####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^[ \t]*###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^[ \t]*##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^[ \t]*#\s+(.+)$/gm, '<h1>$1</h1>');

  // 6. Blockquotes: > quote
  html = html.replace(/^[ \t]*>\s+(.+)$/gm, '<blockquote><p>$1</p></blockquote>');

  // 7. Unordered Lists: - item or * item
  html = html.replace(/^[ \t]*(?:[-*])\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  // Fix consecutive <ul> tags
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // 8. Ordered Lists: 1. item
  html = html.replace(/^[ \t]*\d+\.\s+(.+)$/gm, '<oli>$1</oli>');
  html = html.replace(/(<oli>[\s\S]*?<\/oli>)/g, '<ol>$1</ol>');
  html = html.replace(/<\/ol>\s*<ol>/g, '');
  html = html.replace(/<oli>/g, '<li>').replace(/<\/oli>/g, '</li>');

  // 8.5. Tables: | col1 | col2 |
  html = html.replace(/(?:^|\n)([ \t]*\|[^\r\n]+\|[ \t]*\r?\n[ \t]*\|[-: |]+\|[ \t]*\r?\n(?:[ \t]*\|[^\r\n]+\|[ \t]*(?:\r?\n|$))+)/g, (match) => {
    const lines = match.trim().split('\n').map((l) => l.trim());
    if (lines.length < 2 || !lines[0]) return match;
    const headerCols = lines[0]
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => `<th>${c.trim()}</th>`)
      .join('');
    const thead = `<thead><tr>${headerCols}</tr></thead>`;
    const tbodyRows = lines
      .slice(2)
      .map((row) => {
        const cols = row
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => `<td>${c.trim()}</td>`)
          .join('');
        return `<tr>${cols}</tr>`;
      })
      .join('');
    return `\n<table>${thead}<tbody>${tbodyRows}</tbody></table>\n`;
  });

  // 9. Images: ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // 10. Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 11. Bold & Italics
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 12. Paragraphs (lines separated by double newlines)
  const paragraphs = html.split(/\n\s*\n/);
  html = paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      // Don't wrap if already a block element
      if (/^(?:<(?:h[1-6]|ul|ol|li|blockquote|pre|hr|div|table)|%%BIRCODEBLOCK)/i.test(trimmed)) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  // 13. Restore Inline Code
  inlineCodes.forEach((code, index) => {
    html = html.replace(`%%BIRINLINECODE${index}%%`, code);
  });

  // 14. Restore Fenced Code Blocks
  codeBlocks.forEach((code, index) => {
    html = html.replace(`<p>%%BIRCODEBLOCK${index}%%</p>`, code);
    html = html.replace(`%%BIRCODEBLOCK${index}%%`, code);
  });

  return html;
}
