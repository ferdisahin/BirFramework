import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'bir-package-smoke-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const env = { ...process.env, NODE_ENV: 'test', DB_CONNECTION: 'sqlite' };
delete env.DB_DATABASE;

function run(executable, args, cwd, capture = false) {
  return execFileSync(executable, args, {
    cwd, env, encoding: 'utf8', timeout: 120_000, stdio: capture ? 'pipe' : 'inherit',
  });
}

async function testServer(command, args, cwd, verify) {
  const ownGroup = process.platform !== 'win32';
  const child = spawn(command, args, {
    detached: ownGroup,
    cwd,
    env: { ...env, NODE_ENV: 'production', PORT: '33019', APP_KEY: 'local-package-smoke-fixture-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let output = '';
  child.stderr.on('data', (chunk) => { output += chunk; });

  try {
    const port = await new Promise((ready, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for starter HTTP server.')), 15_000);
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const port = output.match(/BirJS ready at http:\/\/localhost:(\d+)/)?.[1];
        if (port) {
          clearTimeout(timer);
          ready(port);
        }
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Starter exited with code ${code}.`));
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const origin = `http://127.0.0.1:${port}`;
    assert.equal((await (await fetch(origin + '/api/health')).json()).status, 'ok');
    await verify(origin);
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    if (child.exitCode === null && child.pid) {
      if (ownGroup) process.kill(-child.pid);
      else child.kill();
      await exited;
    }
  }
}

try {
  const packed = JSON.parse(run(npm, ['pack', '--ignore-scripts', '--pack-destination', temporary, '--json'], root, true));
  const tarball = join(temporary, packed[0].filename);

  assert.ok(!packed[0].files.some(({ path }) =>
    path.startsWith('dist/view/turbo.') ||
    path.startsWith('dist/view/engine.') ||
    /^dist\/jsx\/(?:jsx-(?:dev-)?runtime|render|escape|types)\./.test(path)
  ));
  const cli = join(root, 'bin/bir.js');
  for (const flag of ['--birturbo', '--bir-turbo', '--hotwire', '--blade']) {
    assert.throws(
      () => run(process.execPath, [cli, 'new', 'retired-profile', flag], temporary, true),
      (error) => error.status !== 0 && /(?:has|have) been removed/.test(error.stderr)
    );
    assert.equal(existsSync(join(temporary, 'retired-profile')), false);
  }
  assert.throws(
    () => run(process.execPath, [cli, 'make:island', 'Retired'], temporary, true),
    (error) => error.status !== 0 && error.stderr.includes('make:island has been removed')
  );

  for (const [name, flags] of [
    ['typescript-inertia', ['--ts', '--tailwind', '--inertia']],
    ['javascript-preact-ssr', ['--js', '--css', '--server-rendered']],
  ]) {
    run(process.execPath, [join(root, 'bin/bir.js'), 'new', name, ...flags], temporary);
    const app = join(temporary, name);
    run(npm, ['install', '--no-audit', '--no-fund', tarball], app);
    const entry = join(app, 'node_modules/birframework/bin/bir.js');
    assert.match(run(process.execPath, [entry, 'route:list'], app, true), /\/api\/health/);

    if (name === 'typescript-inertia') {
      run(process.execPath, [entry, 'make:migration', 'create_smoke_items_table'], app);
      assert.match(run(process.execPath, [entry, 'migrate:status'], app, true), /pending/);
      assert.equal(existsSync(join(app, 'database/database.sqlite')), false);
      run(process.execPath, [entry, 'migrate'], app);
      assert.match(run(process.execPath, [entry, 'migrate:status'], app, true), /applied/);
      run(process.execPath, [entry, 'make:auth'], app);
      run(process.execPath, [entry, 'migrate'], app);
      run(npm, ['run', 'build'], app);
      assert.match(run(process.execPath, [entry, 'doctor'], app, true), /Vite manifest is readable/);
      await testServer(process.execPath, ['--import', 'tsx', 'app.ts'], app, async (origin) => {
        const response = await fetch(origin);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.match(html, /data-page=/);
        assert.match(html, /class="min-h-screen/);
        const asset = html.match(/src="(\/build\/[^"]+)"/)?.[1];
        assert.ok(asset);
        assert.equal((await fetch(origin + asset)).status, 200);
        const login = await fetch(origin + '/login');
        assert.equal(login.status, 200);
        const form = await login.text();
        assert.match(form, /Welcome back/);
        assert.match(form, /name="_token" value="[a-f0-9]+"/);
      });
    } else {
      const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
      assert.equal(manifest.dependencies['@hotwired/turbo'], undefined);
      assert.equal(existsSync(join(app, 'vite.config.js')), false);
      await testServer(process.execPath, [entry, 'serve', '--port', '33019'], app, async (origin) => {
        const response = await fetch(origin);
        assert.equal(response.status, 200);
        assert.match(await response.text(), /<!DOCTYPE html>[\s\S]*get started/i);
      });
    }
    console.log(`Package smoke passed: ${name}`);
  }

  const example = join(temporary, 'vercel');
  cpSync(join(root, 'examples/vercel'), example, { recursive: true });
  run(npm, ['install', '--no-audit', '--no-fund', tarball], example);
  const previousVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  const handler = (await import(pathToFileURL(join(example, 'api/index.js')).href)).default;
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const headers = { 'x-matched-path': '/api/health' };
    const rewritten = await fetch(origin + '/api/index.js', { headers });
    assert.equal(rewritten.status, 200);
    assert.deepEqual(await rewritten.json(), { status: 'ok' });
    assert.match(await (await fetch(origin)).text(), /BirFramework on Vercel/);
    assert.deepEqual(await (await fetch(origin + '/api/health')).json(), { status: 'ok' });
  } finally {
    server.close();
    await once(server, 'close');
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
  console.log('Package smoke passed: Vercel example handler');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
