import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { h } from 'preact';
import { Application, Mailable, createTestClient } from '../src/index.js';
import { Csrf, ErrorMessage, Flash, Method } from '../src/jsx/index.js';

test('Context renders Preact components and VNodes, including hooks and escaping', async () => {
  const { useState } = await import('preact/hooks');
  function Page({ value }: { value: string }) {
    const [text] = useState(value);
    return h('html', null, h('body', null, h('p', null, text)));
  }
  const app = new Application();
  app.router.get('/page', (ctx) => ctx.render(Page, { value: '<strong>example</strong>' }));
  app.router.get('/node', (ctx) => ctx.renderJsx(h('p', null, 'Preact node'), 201));
  const client = createTestClient(app);
  try {
    const page = await client.get('/page');
    page.assertOk();
    assert.match(page.text(), /^<!DOCTYPE html>/);
    assert.match(page.text(), /&lt;strong(?:&gt;|>)example&lt;\/strong(?:&gt;|>)/);
    const node = await client.get('/node');
    node.assertStatus(201);
    assert.equal(node.text(), '<p>Preact node</p>');
  } finally {
    await client.close();
  }
});

test('Named views resolve Preact files and reject legacy templates and paths outside views', async () => {
  const original = process.cwd();
  const fixture = mkdtempSync(join(original, 'preact-views-'));
  const app = new Application();
  const client = createTestClient(app);
  const { loadPreactView } = await import('../src/view/preact.js');
  try {
    mkdirSync(join(fixture, 'views', 'admin'), { recursive: true });
    writeFileSync(join(fixture, 'views', 'admin', 'Home.tsx'),
      'import { h } from "preact"; export default ({ name }: { name: string }) => h("h1", null, name);');
    writeFileSync(join(fixture, 'views', 'legacy.bir'), '<h1>Legacy</h1>');
    process.chdir(fixture);
    app.router.get('/', (ctx) => ctx.render('admin.Home', { name: 'BirJS' }));
    assert.equal((await client.get('/')).text(), '<h1>BirJS</h1>');
    assert.equal(await loadPreactView('legacy'), null);
    assert.equal(await loadPreactView('../admin/Home'), null);
  } finally {
    await client.close();
    process.chdir(original);
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('Preact form helpers use the active request context', async () => {
  const app = new Application();
  app.router.get('/', (ctx) => {
    ctx.session?.flash('errors', { email: 'Invalid email' });
    ctx.session?.flash('success', 'Saved');
    return ctx.render(h('form', null, h(Csrf, {}), h(Method, { method: 'PATCH' }), h(ErrorMessage, { field: 'email' }), h(Flash, {})));
  });
  const client = createTestClient(app);
  try {
    const response = await client.get('/');
    response.assertOk();
    assert.match(response.text(), /name="_token" value="[a-f0-9]+"/);
    assert.match(response.text(), /name="_method" value="PATCH"/);
    assert.match(response.text(), /Invalid email/);
    assert.match(response.text(), /Saved/);
  } finally {
    await client.close();
  }
});

test('Mailable views render Preact content', async () => {
  class Welcome extends Mailable {
    content() { return this.view(h('p', null, 'Welcome ', '<user>')); }
  }
  assert.match(await new Welcome().content(), /<p>Welcome &lt;user(?:&gt;|>)<\/p>/);
});
