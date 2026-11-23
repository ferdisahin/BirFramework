import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNewProject } from '../src/cli/commands/new.js';

describe('BirFramework CLI Project Scaffolding Tests', () => {
  const testTailwindApp = resolve(process.cwd(), 'test-tailwind-app');
  const testCssApp = resolve(process.cwd(), 'test-css-app');

  afterEach(() => {
    if (existsSync(testTailwindApp)) {
      rmSync(testTailwindApp, { recursive: true, force: true });
    }
    if (existsSync(testCssApp)) {
      rmSync(testCssApp, { recursive: true, force: true });
    }
  });

  test('should scaffold TypeScript project with Tailwind CSS by default', async () => {
    await createNewProject('test-tailwind-app', 'ts', 'tailwind');

    assert.strictEqual(existsSync(resolve(testTailwindApp, 'package.json')), true);
    assert.strictEqual(existsSync(resolve(testTailwindApp, 'tsconfig.json')), true);
    assert.strictEqual(existsSync(resolve(testTailwindApp, 'app.ts')), true);
    assert.strictEqual(existsSync(resolve(testTailwindApp, 'routes/web.ts')), true);
    assert.strictEqual(existsSync(resolve(testTailwindApp, 'public/css/app.css')), true);

    const layoutHtml = readFileSync(resolve(testTailwindApp, 'views/layouts/app.html'), 'utf-8');
    assert.match(layoutHtml, /cdn\.tailwindcss\.com/);
    assert.match(layoutHtml, /bir_scripts/);
  });

  test('should scaffold JavaScript project with Pure CSS when requested', async () => {
    await createNewProject('test-css-app', 'js', 'css');

    assert.strictEqual(existsSync(resolve(testCssApp, 'package.json')), true);
    assert.strictEqual(existsSync(resolve(testCssApp, 'tsconfig.json')), false); // Pure JS has no tsconfig
    assert.strictEqual(existsSync(resolve(testCssApp, 'app.js')), true);
    assert.strictEqual(existsSync(resolve(testCssApp, 'routes/web.js')), true);
    assert.strictEqual(existsSync(resolve(testCssApp, 'public/css/app.css')), true);

    const cssContent = readFileSync(resolve(testCssApp, 'public/css/app.css'), 'utf-8');
    assert.match(cssContent, /--bg-color/);
    assert.match(cssContent, /\.card-main/);

    const layoutHtml = readFileSync(resolve(testCssApp, 'views/layouts/app.html'), 'utf-8');
    assert.doesNotMatch(layoutHtml, /cdn\.tailwindcss\.com/);
    assert.match(layoutHtml, /href="\/css\/app\.css"/);
  });
});
