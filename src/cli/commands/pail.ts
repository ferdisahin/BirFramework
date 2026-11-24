import { existsSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function formatLine(line: string): string {
  if (!line.trim()) return '';

  // Match pattern: [2026-11-24T13:00:00.000Z] bir.LEVEL: message {context}
  const match = line.match(/^\[(.*?)\]\s+bir\.([A-Z]+):\s+(.*)$/);
  if (!match) {
    return `\x1b[90m${line}\x1b[0m`;
  }

  const rawTime = match[1];
  const level = match[2];
  const rest = match[3] || '';

  if (!rawTime || !level) {
    return `\x1b[90m${line}\x1b[0m`;
  }

  const time = new Date(rawTime).toLocaleTimeString();

  let badge = `\x1b[7m ${level} \x1b[0m`;
  switch (level) {
    case 'INFO':
    case 'NOTICE':
      badge = `\x1b[38;2;0;245;212m[${level}]\x1b[0m`; // Electric Teal
      break;
    case 'WARN':
    case 'WARNING':
      badge = `\x1b[38;2;255;183;3m[${level}]\x1b[0m`; // Electric Amber
      break;
    case 'ERROR':
    case 'CRITICAL':
    case 'ALERT':
    case 'EMERGENCY':
      badge = `\x1b[38;2;247;37;133m[${level}]\x1b[0m`; // Neon Rose
      break;
    case 'DEBUG':
      badge = `\x1b[38;2;181;23;158m[${level}]\x1b[0m`; // Cyber Violet
      break;
  }

  // Check if rest contains JSON context
  const jsonIndex = rest.indexOf('{');
  if (jsonIndex !== -1 && rest.endsWith('}')) {
    const msg = rest.slice(0, jsonIndex).trim();
    const json = rest.slice(jsonIndex).trim();
    return `\x1b[90m${time}\x1b[0m ${badge} \x1b[1m${msg}\x1b[0m \x1b[90m${json}\x1b[0m`;
  }

  return `\x1b[90m${time}\x1b[0m ${badge} ${rest}`;
}

export function runPail(customPath?: string): void {
  const logDir = join(process.cwd(), 'storage', 'logs');
  const logFile = customPath || join(logDir, 'bir.log');

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  if (!existsSync(logFile)) {
    writeFileSync(logFile, `[${new Date().toISOString()}] bir.INFO: BirPail log stream initialized.\n`, 'utf-8');
  }

  console.log('\n\x1b[38;2;0;245;212m⚡ BirJS Pail\x1b[0m - \x1b[90mReal-Time Application Log Stream\x1b[0m');
  console.log(`\x1b[90m➜ Watching:\x1b[0m \x1b[36m${logFile}\x1b[0m`);
  console.log('\x1b[90m➜ Press Ctrl+C to exit\x1b[0m\n');

  let currentSize = statSync(logFile).size;

  // Print existing tail (last 10 lines)
  try {
    const fd = openSync(logFile, 'r');
    const readLength = Math.min(currentSize, 4096);
    const buffer = Buffer.alloc(readLength);
    readSync(fd, buffer, 0, readLength, Math.max(0, currentSize - readLength));
    const initialText = buffer.toString('utf-8');
    const lines = initialText.split('\n').filter(Boolean).slice(-10);
    for (const line of lines) {
      console.log(formatLine(line));
    }
  } catch {
    // ignore
  }

  let isReading = false;
  const interval = setInterval(() => {
    if (isReading) return;
    try {
      if (!existsSync(logFile)) return;
      const stat = statSync(logFile);
      if (stat.size > currentSize) {
        isReading = true;
        const diff = stat.size - currentSize;
        const buffer = Buffer.alloc(diff);
        const fd = openSync(logFile, 'r');
        readSync(fd, buffer, 0, diff, currentSize);
        currentSize = stat.size;

        const newLines = buffer.toString('utf-8').split('\n');
        for (const line of newLines) {
          if (line.trim()) {
            console.log(formatLine(line));
          }
        }
        isReading = false;
      } else if (stat.size < currentSize) {
        // File rotated or truncated
        currentSize = stat.size;
      }
    } catch {
      isReading = false;
    }
  }, 250);

  process.on('SIGINT', () => {
    clearInterval(interval);
    process.exit(0);
  });
}
