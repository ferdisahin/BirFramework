#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distCli = resolve(__dirname, '../dist/cli/index.js');
const srcCli = resolve(__dirname, '../src/cli/index.ts');

const isTsProject = existsSync(resolve(process.cwd(), 'tsconfig.json'));
const underTsx = Boolean(process.env.TSX_LOADED || process.execArgv.some((a) => a.includes('tsx')));

if ((isTsProject && !underTsx) || !existsSync(distCli)) {
  const target = existsSync(distCli) ? distCli : srcCli;
  const args = [target, ...process.argv.slice(2)];
  let tsxCli;
  try {
    tsxCli = createRequire(resolve('package.json')).resolve('tsx/cli');
  } catch {
    // Preserve the npm fallback for projects that have not installed tsx locally.
  }
  const child = spawn(tsxCli ? process.execPath : 'npx', tsxCli ? [tsxCli, ...args] : ['tsx', ...args], {
    stdio: 'inherit',
    env: { ...process.env, TSX_LOADED: '1' },
  });
  child.once('error', (error) => {
    console.error('[BirCLI] Could not launch tsx:', error.message);
    process.exitCode = 1;
  });
  child.once('close', (code) => {
    if (code !== null) process.exitCode = code;
  });
} else {
  const { runCLI } = await import(pathToFileURL(distCli).href);
  await runCLI(process.argv.slice(2));
}
