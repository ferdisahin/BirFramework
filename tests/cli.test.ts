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
    assert.strictEqual(existsSync(resolve(testTailwindApp, 'resources/css/app.css')), true);
    assert.strictEqual(existsSync(resolve(testTailwindApp, 'public/css/app.css')), true);

    const pkg = JSON.parse(readFileSync(resolve(testTailwindApp, 'package.json'), 'utf-8'));
    assert.ok(pkg.devDependencies['@tailwindcss/cli']);
    assert.ok(pkg.devDependencies['tailwindcss']);
    assert.ok(pkg.devDependencies['concurrently']);
    assert.ok(pkg.scripts['build:css']);
    assert.ok(pkg.scripts['watch:css']);

    const layoutHtml = readFileSync(resolve(testTailwindApp, 'views/layouts/app.html'), 'utf-8');
    assert.doesNotMatch(layoutHtml, /cdn\.tailwindcss\.com/);
    assert.match(layoutHtml, /href="\/css\/app\.css"/);
    assert.match(layoutHtml, /bir_scripts/);

    const welcomeHtml = readFileSync(resolve(testTailwindApp, 'views/welcome.html'), 'utf-8');
    assert.match(welcomeHtml, /BirFramework/);
    assert.match(welcomeHtml, /routes\/web\.ts/);
  });

  test('should scaffold JavaScript project with Pure CSS when requested', async () => {
    await createNewProject('test-css-app', 'js', 'css');

    assert.strictEqual(existsSync(resolve(testCssApp, 'package.json')), true);
    assert.strictEqual(existsSync(resolve(testCssApp, 'tsconfig.json')), false); // Pure JS has no tsconfig
    assert.strictEqual(existsSync(resolve(testCssApp, 'app.js')), true);
    assert.strictEqual(existsSync(resolve(testCssApp, 'routes/web.js')), true);
    assert.strictEqual(existsSync(resolve(testCssApp, 'public/css/app.css')), true);

    const cssContent = readFileSync(resolve(testCssApp, 'public/css/app.css'), 'utf-8');
    assert.match(cssContent, /#000000/);
    assert.match(cssContent, /\.card/);

    const layoutHtml = readFileSync(resolve(testCssApp, 'views/layouts/app.html'), 'utf-8');
    assert.doesNotMatch(layoutHtml, /cdn\.tailwindcss\.com/);
    assert.match(layoutHtml, /href="\/css\/app\.css"/);

    const welcomeHtml = readFileSync(resolve(testCssApp, 'views/welcome.html'), 'utf-8');
    assert.match(welcomeHtml, /BirFramework/);
    assert.match(welcomeHtml, /routes\/web\.js/);
  });

  test('should scaffold complete authentication system via make:auth / scaffoldAuth', async () => {
    const { scaffoldAuth } = await import('../src/cli/commands/auth.js');
    const testAuthApp = resolve(process.cwd(), 'test-auth-app');
    
    // First create a starter app to test auth scaffolding inside
    await createNewProject('test-auth-app', 'ts', 'tailwind');

    const originalCwd = process.cwd();
    process.chdir(testAuthApp);

    try {
      scaffoldAuth();

      assert.strictEqual(existsSync(resolve(testAuthApp, 'app/models/User.ts')), true);
      assert.strictEqual(existsSync(resolve(testAuthApp, 'app/controllers/AuthController.ts')), true);
      assert.strictEqual(existsSync(resolve(testAuthApp, 'views/auth/login.html')), true);
      assert.strictEqual(existsSync(resolve(testAuthApp, 'views/auth/register.html')), true);
      assert.strictEqual(existsSync(resolve(testAuthApp, 'views/dashboard.html')), true);

      // Verify routes were appended
      const routesContent = readFileSync(resolve(testAuthApp, 'routes/web.ts'), 'utf-8');
      assert.match(routesContent, /AuthController/);
      assert.match(routesContent, /\/login/);
      assert.match(routesContent, /\/dashboard/);
    } finally {
      process.chdir(originalCwd);
      if (existsSync(testAuthApp)) {
        rmSync(testAuthApp, { recursive: true, force: true });
      }
    }
  });
});
