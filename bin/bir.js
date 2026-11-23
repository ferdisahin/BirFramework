#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distCli = resolve(__dirname, '../dist/cli/index.js');
const srcCli = resolve(__dirname, '../src/cli/index.ts');

const isTsProject = existsSync(resolve(process.cwd(), 'tsconfig.json'));
const underTsx = Boolean(process.env.TSX_LOADED || process.execArgv.some((a) => a.includes('tsx')));

if (isTsProject && !underTsx) {
  const targetScript = existsSync(distCli) ? distCli : srcCli;
  const child = spawn('npx', ['tsx', targetScript, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, TSX_LOADED: '1' },
  });
  child.on('exit', (code) => {
    process.exit(code || 0);
  });
} else if (existsSync(distCli)) {
  const { runCLI } = await import(distCli);
  await runCLI(process.argv.slice(2));
} else {
  const child = spawn('npx', ['tsx', srcCli, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}
