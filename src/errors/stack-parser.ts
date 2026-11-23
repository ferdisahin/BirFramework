import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';

export interface StackFrame {
  functionName: string;
  file: string;
  shortFile: string;
  line: number;
  column: number;
  isAppFrame: boolean;
  codeSnippet?: CodeLine[];
}

export interface CodeLine {
  lineNumber: number;
  code: string;
  isErrorLine: boolean;
}

export class StackParser {
  public static parse(stack?: string): StackFrame[] {
    if (!stack) return [];

    const lines = stack.split('\n');
    const frames: StackFrame[] = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed.startsWith('at ')) continue;

      const frame = this.parseLine(trimmed);
      if (frame) {
        frames.push(frame);
      }
    }

    return frames;
  }

  public static getTopAppFrame(frames: StackFrame[]): StackFrame | undefined {
    return frames.find((f) => f.isAppFrame) || frames[0];
  }

  private static parseLine(line: string): StackFrame | null {
    // Pattern 1: at FunctionName (path/to/file.ts:10:5)
    // Pattern 2: at path/to/file.ts:10:5
    const regexWithFn = /^at\s+(?:async\s+)?(.+?)\s+\((?:file:\/\/)?([^:]+):(\d+):(\d+)\)$/;
    const regexWithoutFn = /^at\s+(?:async\s+)?(?:file:\/\/)?([^:]+):(\d+):(\d+)$/;

    let functionName = '<anonymous>';
    let file = '';
    let lineNum = 0;
    let colNum = 0;

    const matchWithFn = line.match(regexWithFn);
    if (matchWithFn && matchWithFn[1] && matchWithFn[2] && matchWithFn[3] && matchWithFn[4]) {
      functionName = matchWithFn[1];
      file = matchWithFn[2];
      lineNum = parseInt(matchWithFn[3], 10);
      colNum = parseInt(matchWithFn[4], 10);
    } else {
      const matchWithout = line.match(regexWithoutFn);
      if (matchWithout && matchWithout[1] && matchWithout[2] && matchWithout[3]) {
        file = matchWithout[1];
        lineNum = parseInt(matchWithout[2], 10);
        colNum = parseInt(matchWithout[3], 10);
      } else {
        return null;
      }
    }

    const cwd = process.cwd();
    const shortFile = file.startsWith(cwd) ? relative(cwd, file) : file;
    const isAppFrame =
      !file.includes('node_modules') &&
      !file.startsWith('node:') &&
      !file.includes('internal/') &&
      !file.includes('/BirFramework/dist/') &&
      !file.includes('/BirFramework/src/');

    const frame: StackFrame = {
      functionName,
      file,
      shortFile,
      line: lineNum,
      column: colNum,
      isAppFrame,
    };

    if (existsSync(file)) {
      try {
        frame.codeSnippet = this.extractCodeSnippet(file, lineNum);
      } catch {
        // file reading fallback
      }
    }

    return frame;
  }

  private static extractCodeSnippet(filePath: string, errorLine: number, contextRadius: number = 5): CodeLine[] {
    const content = readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');

    const start = Math.max(1, errorLine - contextRadius);
    const end = Math.min(allLines.length, errorLine + contextRadius);

    const snippet: CodeLine[] = [];
    for (let i = start; i <= end; i++) {
      snippet.push({
        lineNumber: i,
        code: allLines[i - 1] ?? '',
        isErrorLine: i === errorLine,
      });
    }

    return snippet;
  }
}
