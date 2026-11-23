import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { birScripts } from './turbo.js';
import { parseMarkdown } from './markdown.js';
import { VERSION } from '../version.js';
import { __, Lang } from '../localization/translator.js';

export type MarkdownParser = (markdown: string) => string;

export interface ViewEngineOptions {
  viewsDir?: string;
  cache?: boolean;
}

export class ViewEngine {
  private viewsDir: string;
  private templateCache = new Map<string, string>();
  private static customMarkdownParser?: MarkdownParser;
  private rawBlocks = new Map<string, string>();
  private rawBlockCounter = 0;
  private compileDepth = 0;

  constructor(options: ViewEngineOptions = {}) {
    this.viewsDir = options.viewsDir || resolve(process.cwd(), 'views');
  }

  public static setMarkdownParser(parser: MarkdownParser) {
    ViewEngine.customMarkdownParser = parser;
  }

  public parseMarkdown(content: string): string {
    if (ViewEngine.customMarkdownParser) {
      return ViewEngine.customMarkdownParser(content);
    }
    return parseMarkdown(content);
  }

  public render(templateName: string, data: Record<string, any> = {}): string {
    const rawTemplate = this.loadTemplate(templateName);
    const viewScope = {
      version: VERSION,
      __: (key: string, replace?: Record<string, any>, locale?: string) => __(key, replace, locale),
      Lang,
      ...data,
    };
    return this.compile(rawTemplate, viewScope);
  }

  public loadTemplate(name: string): string {
    const cleanName = name.replace(/\.(html|bir|blade\.php)$/, '').replace(/\./g, '/');
    const possiblePaths = [
      join(this.viewsDir, `${cleanName}.html`),
      join(this.viewsDir, `${cleanName}.bir`),
      join(this.viewsDir, 'components', `${cleanName}.html`),
      join(this.viewsDir, `${cleanName}.view`),
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return readFileSync(p, 'utf-8');
      }
    }

    throw new Error(`[BirView] View template not found: "${name}" in ${this.viewsDir}`);
  }

  /**
   * Modern Blade-style Component & Directive Compiler
   */
  public compile(template: string, data: Record<string, any> = {}): string {
    const scope = {
      version: VERSION,
      __: (key: string, replace?: Record<string, any>, locale?: string) => __(key, replace, locale),
      Lang,
      ...data,
    };

    this.compileDepth++;
    try {
      let output = template;

      // 1. Process Modern Blade Component Tags: <x-component.name ...>...</x-component.name>
      output = this.compileComponents(output, scope);

      // 1.1 Process {!! bir_scripts() !!} or @birScripts for Instant Turbo Navigation
      output = output.replace(/\{!!\s*(?:bir_scripts|birScripts)\(\)?\s*!!\}/g, birScripts());
      output = output.replace(/@birScripts/g, birScripts());

      // 1.2 Markdown Block: @markdown ... @endmarkdown
      output = output.replace(/@markdown([\s\S]*?)@endmarkdown/g, (_, md) => {
        const token = `%%BIR_RAW_BLOCK_${++this.rawBlockCounter}%%`;
        const rendered = this.parseMarkdown(md.trim());
        this.rawBlocks.set(token, rendered);
        return token;
      });

      // 1.3 Markdown Inline/Variable: @markdown(expr)
      output = output.replace(/@markdown\s*\((.+?)\)/g, (_, expr) => {
        const cleanVar = expr.trim().replace(/^\$/, '');
        const val = this.resolveVariable(cleanVar, data);
        if (typeof val === 'string') {
          const token = `%%BIR_RAW_BLOCK_${++this.rawBlockCounter}%%`;
          const rendered = this.parseMarkdown(val);
          this.rawBlocks.set(token, rendered);
          return token;
        }
        return '';
      });

      // 1.4 Localization: @lang('key')
      output = output.replace(/@lang\s*\((['"])(.*?)\1\)/g, (_match, _quote, key) => {
        return __(key);
      });

      // 2. Legacy Layout support: @extends('layouts/...') & @section('...')
      output = this.compileLegacyLayouts(output, data);

      // 3. Loops: Support both Laravel Blade (@foreach($items as $item) or @foreach($items as $key => $item))
      // and JavaScript/Python style (@foreach(item in items) or @for(item of items))
      const loopRegex = /@(foreach|for)\s*\(([\s\S]*?)\)([\s\S]*?)@(endforeach|endfor)/g;
      output = output.replace(loopRegex, (_, __, expr, innerContent) => {
        const trimmed = expr.trim();
        let listVar = '';
        let itemVar = '';
        let keyVar: string | undefined;

        // Check for Laravel style: "list as item" or "list as key => item"
        if (/\bas\b/i.test(trimmed)) {
          const parts = trimmed.split(/\bas\b/i);
          listVar = parts[0].trim().replace(/^\$/, '');
          const right = parts[1].trim();
          if (right.includes('=>')) {
            const [k, v] = right.split('=>').map((s: string) => s.trim().replace(/^\$/, ''));
            keyVar = k;
            itemVar = v;
          } else {
            itemVar = right.replace(/^\$/, '');
          }
        } else {
          // JS / Python style: "item in list" or "item of list" (optional "const")
          const cleanExpr = trimmed.replace(/^const\s+/, '');
          const match = cleanExpr.match(/^([a-zA-Z0-9_]+)\s+(?:in|of)\s+([a-zA-Z0-9_.]+)/);
          if (match) {
            itemVar = match[1].replace(/^\$/, '');
            listVar = match[2].replace(/^\$/, '');
          }
        }

        if (!listVar || !itemVar) return '';

        const list = this.resolveVariable(listVar, data);
        if (!Array.isArray(list)) return '';

        return list
          .map((item, index) => {
            const itemScope: Record<string, any> = {
              ...data,
              [itemVar]: item,
              $index: index,
              $first: index === 0,
              $last: index === list.length - 1,
            };
            if (keyVar) {
              itemScope[keyVar] = index;
            }
            return this.compile(innerContent, itemScope);
          })
          .join('');
      });

      // 4. Conditionals: @if(condition) ... @else ... @endif
      const ifRegex = /@if\s*\((.+?)\)([\s\S]*?)(?:@else([\s\S]*?))?@endif/g;
      output = output.replace(ifRegex, (_, condition, trueContent, falseContent) => {
        const isTrue = this.evaluateCondition(condition, scope);
        return isTrue ? this.compile(trueContent, scope) : falseContent ? this.compile(falseContent, scope) : '';
      });

      // 5. Unescaped HTML: {!! var !!} or {!! slot !!}
      output = output.replace(/\{!!\s*([\s\S]+?)\s*!!\}/g, (_, expression) => {
        const trimmed = expression.trim();
        const cleanVar = trimmed.replace(/^\$/, '');

        // Support function calls e.g. {!! bir_scripts() !!} or {!! __('raw.html') !!}
        if (cleanVar.includes('(') && cleanVar.includes(')')) {
          try {
            const fn = new Function(...Object.keys(scope), `return (${cleanVar});`);
            const res = fn(...Object.values(scope));
            return res !== undefined && res !== null ? String(res) : '';
          } catch {
            // fallback
          }
        }

        const val = this.resolveVariable(cleanVar, scope);
        return val !== undefined && val !== null ? String(val) : '';
      });

      // 6. Escaped variables, expressions and ternary: {{ var }} or {{ a == b ? 'yes' : 'no' }}
      output = output.replace(/\{\{\s*([\s\S]+?)\s*\}\}/g, (_, expression) => {
        const trimmed = expression.trim();
        // Check for ternary expression: cond ? trueVal : falseVal
        if (trimmed.includes('?') && trimmed.includes(':')) {
          const qIdx = trimmed.indexOf('?');
          const cIdx = trimmed.indexOf(':', qIdx);
          if (qIdx !== -1 && cIdx !== -1) {
            const cond = trimmed.slice(0, qIdx).trim();
            const trueVal = trimmed.slice(qIdx + 1, cIdx).trim();
            const falseVal = trimmed.slice(cIdx + 1).trim();
            const isTrue = this.evaluateCondition(cond, scope);
            const rawVal = isTrue ? trueVal : falseVal;
            // Strip quotes if literal string
            const cleanVal = rawVal.replace(/^['"](.*)['"]$/, '$1');
            return this.escapeHtml(cleanVal);
          }
        }

        const cleanVar = trimmed.replace(/^\$/, '');

        // Support function calls and expressions in {{ ... }} e.g. {{ __('welcome', { name: 'Zeynep' }) }}
        if (cleanVar.includes('(') && cleanVar.includes(')')) {
          try {
            const fn = new Function(...Object.keys(scope), `return (${cleanVar});`);
            const res = fn(...Object.values(scope));
            return res !== undefined && res !== null ? this.escapeHtml(String(res)) : '';
          } catch {
            // fallback
          }
        }

        const val = this.resolveVariable(cleanVar, scope);
        return val !== undefined && val !== null ? this.escapeHtml(String(val)) : '';
      });

      // 7. Top-level restoration of protected Raw/Markdown blocks
      if (this.compileDepth === 1 && this.rawBlocks.size > 0) {
        for (const [token, content] of this.rawBlocks) {
          output = output.replaceAll(token, content);
        }
        this.rawBlocks.clear();
        this.rawBlockCounter = 0;
      }

      return output;
    } finally {
      this.compileDepth--;
    }
  }

  /**
   * Compiles modern Blade components: <x-layouts.app title="hi">Content <x-slot:after>...</x-slot:after></x-layouts.app>
   */
  private compileComponents(template: string, scope: Record<string, any>): string {
    let result = template;

    // Match <x-component.name attrs...>content</x-component.name>
    const componentRegex = /<x-([a-zA-Z0-9_.-]+)([^>]*)>([\s\S]*?)<\/x-\1>/g;
    // Also support self-closing <x-component.name attrs... />
    const selfClosingRegex = /<x-([a-zA-Z0-9_.-]+)([^>]*)\/>/g;

    // First handle non-self-closing components
    while (componentRegex.test(result)) {
      componentRegex.lastIndex = 0;
      result = result.replace(componentRegex, (_, componentName, rawAttrs, innerContent) => {
        const props = this.parseAttributes(rawAttrs, scope);
        const slots = this.extractSlots(innerContent, scope);

        // Merge component scope: global scope + passed props + default & named slots
        const componentScope = {
          ...scope,
          ...props,
          slot: slots.defaultSlot,
          $slot: slots.defaultSlot,
          ...slots.namedSlots,
        };

        const componentTemplate = this.loadTemplate(componentName);
        return this.compile(componentTemplate, componentScope);
      });
    }

    // Handle self-closing components
    result = result.replace(selfClosingRegex, (_, componentName, rawAttrs) => {
      const props = this.parseAttributes(rawAttrs, scope);
      const componentScope = {
        ...scope,
        ...props,
        slot: '',
        $slot: '',
      };
      const componentTemplate = this.loadTemplate(componentName);
      return this.compile(componentTemplate, componentScope);
    });

    return result;
  }

  /**
   * Extracts <x-slot name="..."> / <x-slot:...> and default slot content
   */
  private extractSlots(innerContent: string, scope: Record<string, any>): { defaultSlot: string; namedSlots: Record<string, string> } {
    const namedSlots: Record<string, string> = {};
    let remainingContent = innerContent;

    // Match <x-slot name="header">...</x-slot> or <slot name="header">...</slot>
    const nameAttrSlotRegex = /<(?:x-slot|slot)\s+name=["']([a-zA-Z0-9_]+)["']>([\s\S]*?)<\/(?:x-slot|slot)>/g;
    remainingContent = remainingContent.replace(nameAttrSlotRegex, (_, slotName, slotContent) => {
      namedSlots[slotName] = this.compile(slotContent.trim(), scope);
      return '';
    });

    // Match <x-slot:header>...</x-slot:header>
    const colonSlotRegex = /<x-slot:([a-zA-Z0-9_]+)>([\s\S]*?)<\/x-slot:\1>/g;
    remainingContent = remainingContent.replace(colonSlotRegex, (_, slotName, slotContent) => {
      namedSlots[slotName] = this.compile(slotContent.trim(), scope);
      return '';
    });

    const defaultSlot = this.compile(remainingContent.trim(), scope);
    return { defaultSlot, namedSlots };
  }

  /**
   * Parses component attributes like title="Hello" or :count="42"
   */
  private parseAttributes(rawAttrs: string, scope: Record<string, any>): Record<string, any> {
    const props: Record<string, any> = {};
    const attrRegex = /([:a-zA-Z0-9_.-]+)(?:=(?:["']([^"']*)["']|([^\s>]+)))?/g;
    let match;

    while ((match = attrRegex.exec(rawAttrs)) !== null) {
      const key = match[1];
      if (!key) continue;

      let val = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : true;

      // Interpolate {{ var }} in attribute values like title="{{ title }}" or slug="{{ slug }}"
      if (typeof val === 'string' && val.includes('{{')) {
        val = val.replace(/\{\{\s*([a-zA-Z0-9_$.]+)\s*\}\}/g, (_, varName) => {
          const clean = varName.replace(/^\$/, '');
          const resolved = this.resolveVariable(clean, scope);
          return resolved !== undefined && resolved !== null ? String(resolved) : '';
        });
      }

      // Handle dynamic bound prop :prop="expr"
      if (key.startsWith(':')) {
        const propName = key.substring(1);
        try {
          const fn = new Function(...Object.keys(scope), `return (${val});`);
          props[propName] = fn(...Object.values(scope));
        } catch {
          props[propName] = this.resolveVariable(String(val), scope);
        }
      } else {
        props[key] = val;
      }
    }

    return props;
  }

  /**
   * Legacy @extends / @section / @yield support
   */
  private compileLegacyLayouts(template: string, data: Record<string, any>): string {
    let output = template;
    const extendsMatch = output.match(/@extends\(['"](.+?)['"]\)/);
    let layoutName: string | null = null;
    if (extendsMatch) {
      layoutName = extendsMatch[1]!;
      output = output.replace(extendsMatch[0], '');
    }

    const sections: Record<string, string> = {};
    const sectionRegex = /@section\(['"](.+?)['"]\)([\s\S]*?)@endsection/g;
    output = output.replace(sectionRegex, (_, name, content) => {
      sections[name] = content.trim();
      return '';
    });

    if (layoutName) {
      const layoutRaw = this.loadTemplate(layoutName);
      output = layoutRaw.replace(/@yield\(['"](.+?)['"]\)/g, (_, name) => {
        return sections[name] || '';
      });
    }

    return output;
  }

  private resolveVariable(path: string, scope: Record<string, any>): any {
    const parts = path.trim().split('.');
    let current: any = scope;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }

  private evaluateCondition(condition: string, scope: Record<string, any>): boolean {
    const trimmed = condition.trim();
    if (/^[a-zA-Z0-9_.]+$/.test(trimmed)) {
      return Boolean(this.resolveVariable(trimmed, scope));
    }

    try {
      const keys = Object.keys(scope);
      const values = Object.values(scope);
      const fn = new Function(...keys, `return Boolean(${trimmed});`);
      return Boolean(fn(...values));
    } catch {
      return false;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export const defaultViewEngine = new ViewEngine();
