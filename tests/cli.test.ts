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
    assert.ok(pkg.devDependencies['@tailwindcss/vite']);
    assert.ok(pkg.devDependencies['tailwindcss']);
    assert.ok(pkg.devDependencies['concurrently']);
    assert.ok(pkg.dependencies['preact']);
    assert.ok(pkg.scripts['dev']);
    assert.ok(pkg.scripts['build']);

    const layoutTsx = readFileSync(resolve(testTailwindApp, 'views/layouts/Layout.tsx'), 'utf-8');
    assert.doesNotMatch(layoutTsx, /cdn\.tailwindcss\.com/);
    assert.match(layoutTsx, /<Vite/);

    const welcomeTsx = readFileSync(resolve(testTailwindApp, 'views/Welcome.tsx'), 'utf-8');
    assert.match(welcomeTsx, /BirJS/);
    assert.match(welcomeTsx, /HomeController\.ts/);
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

    const layoutJsx = readFileSync(resolve(testCssApp, 'views/layouts/Layout.jsx'), 'utf-8');
    assert.doesNotMatch(layoutJsx, /cdn\.tailwindcss\.com/);
    assert.match(layoutJsx, /<Vite/);

    const welcomeJsx = readFileSync(resolve(testCssApp, 'views/Welcome.jsx'), 'utf-8');
    assert.match(welcomeJsx, /BirJS/);
    assert.match(welcomeJsx, /HomeController\.js/);
  });

  test('should scaffold project with Hotwire Turbo when chosen', async () => {
    const testHotwireApp = resolve(process.cwd(), 'test-hotwire-app');
    try {
      await createNewProject('test-hotwire-app', 'ts', 'tailwind', 'hotwire');

      assert.strictEqual(existsSync(resolve(testHotwireApp, 'package.json')), true);
      assert.strictEqual(existsSync(resolve(testHotwireApp, 'resources/js/app.tsx')), true);
      assert.strictEqual(existsSync(resolve(testHotwireApp, 'vite.config.js')), true);

      const pkg = JSON.parse(readFileSync(resolve(testHotwireApp, 'package.json'), 'utf-8'));
      assert.ok(pkg.dependencies['preact']);
      assert.ok(pkg.devDependencies['vite']);

      const tsxContent = readFileSync(resolve(testHotwireApp, 'resources/js/app.tsx'), 'utf-8');
      assert.match(tsxContent, /createBirApp/);

      const layoutTsx = readFileSync(resolve(testHotwireApp, 'views/layouts/Layout.tsx'), 'utf-8');
      assert.match(layoutTsx, /<Vite/);
    } finally {
      if (existsSync(testHotwireApp)) {
        rmSync(testHotwireApp, { recursive: true, force: true });
      }
    }
  });

  test('should scaffold project with None navigation engine when chosen', async () => {
    const testNoneApp = resolve(process.cwd(), 'test-none-app');
    try {
      await createNewProject('test-none-app', 'ts', 'tailwind', 'none');

      const pkg = JSON.parse(readFileSync(resolve(testNoneApp, 'package.json'), 'utf-8'));
      assert.strictEqual(pkg.dependencies['@hotwired/turbo'], undefined);

      const layoutTsx = readFileSync(resolve(testNoneApp, 'views/layouts/Layout.tsx'), 'utf-8');
      assert.doesNotMatch(layoutTsx, /<Vite/);
      assert.match(layoutTsx, /\/css\/app\.css/);
    } finally {
      if (existsSync(testNoneApp)) {
        rmSync(testNoneApp, { recursive: true, force: true });
      }
    }
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
      assert.strictEqual(existsSync(resolve(testAuthApp, 'views/auth/login.tsx')), true);
      assert.strictEqual(existsSync(resolve(testAuthApp, 'views/auth/register.tsx')), true);
      assert.strictEqual(existsSync(resolve(testAuthApp, 'views/dashboard.tsx')), true);

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

  test('should scaffold Service Provider via makeProvider', async () => {
    const { makeProvider } = await import('../src/cli/commands/make.js');
    const targetFile = resolve(process.cwd(), 'app/providers/PaymentServiceProvider.ts');

    try {
      makeProvider('Payment');
      assert.strictEqual(existsSync(targetFile), true);
      const content = readFileSync(targetFile, 'utf-8');
      assert.match(content, /class PaymentServiceProvider extends ServiceProvider/);
      assert.match(content, /public register\(\): void/);
      assert.match(content, /public async boot\(\): Promise<void>/);
    } finally {
      if (existsSync(targetFile)) {
        rmSync(targetFile, { force: true });
      }
      const providersDir = resolve(process.cwd(), 'app/providers');
      if (existsSync(providersDir)) {
        rmSync(providersDir, { recursive: true, force: true });
      }
    }
  });

  test('should scaffold component and folder component with companion JS via makeComponent', async () => {
    const { makeComponent } = await import('../src/cli/commands/make.js');
    const flatFile = resolve(process.cwd(), 'views/components/badge.bir');
    const folderDir = resolve(process.cwd(), 'views/components/testmodal');
    const folderBir = resolve(folderDir, 'testmodal.bir');
    const folderJs = resolve(folderDir, 'testmodal.js');

    try {
      // 1. Flat component
      makeComponent('badge');
      assert.strictEqual(existsSync(flatFile), true);
      assert.match(readFileSync(flatFile, 'utf-8'), /class="badge"/);

      // 2. Folder component with companion JS (-j)
      makeComponent('testmodal', true);
      assert.strictEqual(existsSync(folderBir), true);
      assert.strictEqual(existsSync(folderJs), true);
      assert.match(readFileSync(folderJs, 'utf-8'), /export default function/);
      assert.match(readFileSync(folderJs, 'utf-8'), /el\.querySelector/);
    } finally {
      if (existsSync(flatFile)) rmSync(flatFile, { force: true });
      if (existsSync(folderDir)) rmSync(folderDir, { recursive: true, force: true });
    }
  });
});
