import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ResendMailDriver } from '../src/mail/drivers.js';
import { Mail, Mailable } from '../src/mail/index.js';
import { jsx, Island, renderToString } from '../src/jsx/index.js';
import { createNewProject } from '../src/cli/commands/new.js';

class WelcomeEmail extends Mailable {
  public content(): string {
    return '<h1>Welcome to BirJS</h1>';
  }
}

describe('ResendMailDriver & Preact Islands Tests', () => {
  const originalFetch = globalThis.fetch;
  const tempProject = resolve(process.cwd(), 'test-island-app');

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Mail.restore();
    if (existsSync(tempProject)) {
      rmSync(tempProject, { recursive: true, force: true });
    }
  });

  test('ResendMailDriver sends JSON payload with base64 attachments via fetch', async () => {
    let capturedUrl = '';
    let capturedInit: any = null;

    globalThis.fetch = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
    }) as any;

    const driver = new ResendMailDriver('re_test_key_999');
    Mail.setDriver(driver);

    const mailable = new WelcomeEmail()
      .from('billing@birjs.com', 'BirBilling')
      .subject('Invoice Ready')
      .attach({ filename: 'inv.pdf', content: Buffer.from('PDFDATA') });

    const ok = await Mail.to('user@example.com').send(mailable);
    assert.strictEqual(ok, true);
    assert.strictEqual(capturedUrl, 'https://api.resend.com/emails');
    assert.strictEqual(capturedInit.headers.Authorization, 'Bearer re_test_key_999');

    const body = JSON.parse(capturedInit.body);
    assert.strictEqual(body.from, 'BirBilling <billing@birjs.com>');
    assert.deepStrictEqual(body.to, ['user@example.com']);
    assert.strictEqual(body.attachments[0].filename, 'inv.pdf');
    assert.strictEqual(body.attachments[0].content, Buffer.from('PDFDATA').toString('base64'));
  });

  test('Island component renders data-bir-island and serialized data-bir-props', () => {
    const html = renderToString(
      jsx(Island, {
        name: 'ProfileModal',
        props: { userId: 42, role: 'admin' },
      })
    );

    assert.ok(html.includes('data-bir-island="ProfileModal"'));
    assert.ok(html.includes('data-bir-props="{&quot;userId&quot;:42,&quot;role&quot;:&quot;admin&quot;}"'));
  });

  test('createNewProject scaffolds Unified Preact + Inertia stack when jsx + hotwire are selected', async () => {
    await createNewProject('test-island-app', 'ts', 'tailwind', 'hotwire', 'jsx');

    const pkg = JSON.parse(readFileSync(resolve(tempProject, 'package.json'), 'utf-8'));
    assert.ok(pkg.dependencies['preact']);
    assert.ok(pkg.dependencies['preact-render-to-string']);
    assert.ok(pkg.devDependencies['@preact/preset-vite']);

    assert.strictEqual(existsSync(resolve(tempProject, 'views/pages/Welcome.tsx')), true);
    assert.strictEqual(existsSync(resolve(tempProject, 'resources/js/bir-inertia.tsx')), true);

    const appTsx = readFileSync(resolve(tempProject, 'resources/js/app.tsx'), 'utf-8');
    assert.ok(appTsx.includes('createBirApp'));
    assert.ok(appTsx.includes('views/pages'));

    const viteCfg = readFileSync(resolve(tempProject, 'vite.config.js'), 'utf-8');
    assert.ok(viteCfg.includes('@preact/preset-vite'));
  });
});
