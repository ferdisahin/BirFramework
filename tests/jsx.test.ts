import { test, describe } from 'node:test';
import assert from 'node:assert';
import { jsx, jsxs, Fragment, h, raw, renderToString, renderToHtml, isValidElement } from '../src/jsx/index.js';
import { Application } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('BirFramework Native JSX / TSX Engine Tests', () => {
  test('isValidElement correctly identifies BirJS JSX elements', () => {
    const el = jsx('div', { id: 'test' });
    assert.strictEqual(isValidElement(el), true);
    assert.strictEqual(isValidElement({}), false);
    assert.strictEqual(isValidElement(null), false);
    assert.strictEqual(isValidElement('div'), false);
  });

  test('renders basic HTML tags and attributes', () => {
    const el = jsx('div', { id: 'container', className: 'box p-4' }, null);
    const html = renderToString(el);
    assert.strictEqual(html, '<div id="container" class="box p-4"></div>');
  });

  test('maps className to class and htmlFor to for', () => {
    const label = jsx('label', { htmlFor: 'emailInput', className: 'form-label' }, null);
    const html = renderToString(label);
    assert.strictEqual(html, '<label for="emailInput" class="form-label"></label>');
  });

  test('renders self-closing void elements', () => {
    const input = jsx('input', { type: 'text', name: 'email', required: true });
    assert.strictEqual(renderToString(input), '<input type="text" name="email" required />');

    const img = jsx('img', { src: '/logo.png', alt: 'BirJS Logo' });
    assert.strictEqual(renderToString(img), '<img src="/logo.png" alt="BirJS Logo" />');
  });

  test('renders boolean attributes correctly', () => {
    const btn = jsx('button', { disabled: true, autofocus: true, type: 'submit', children: 'Send' });
    const html = renderToString(btn);
    assert.strictEqual(html, '<button disabled autofocus type="submit">Send</button>');

    const unchecked = jsx('input', { type: 'checkbox', checked: false });
    assert.strictEqual(renderToString(unchecked), '<input type="checkbox" />');
  });

  test('renders style objects formatted as kebab-case css strings', () => {
    const el = jsx('div', {
      style: { backgroundColor: '#000', fontSize: '14px', lineHeight: 1.5 },
      children: 'Styled',
    });
    const html = renderToString(el);
    assert.strictEqual(html, '<div style="background-color:#000;font-size:14px;line-height:1.5">Styled</div>');
  });

  test('escapes HTML strings to prevent XSS injection', () => {
    const unsafeText = '<script>alert("hacked")</script>';
    const el = jsx('p', { children: unsafeText });
    const html = renderToString(el);
    assert.strictEqual(html, '<p>&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;</p>');
  });

  test('renders raw unescaped HTML when raw() is used', () => {
    const safeHtml = raw('<strong>BirJS is fast</strong>');
    const el = jsx('div', { children: safeHtml });
    const html = renderToString(el);
    assert.strictEqual(html, '<div><strong>BirJS is fast</strong></div>');
  });

  test('renders dangerouslySetInnerHTML correctly', () => {
    const el = jsx('div', { dangerouslySetInnerHTML: { __html: '<span>Raw</span>' } });
    const html = renderToString(el);
    assert.strictEqual(html, '<div><span>Raw</span></div>');
  });

  test('renders functional components with props and slots/children', () => {
    function Card(props: { title: string; children?: any }) {
      return jsx('div', {
        className: 'card',
        children: [
          jsx('h2', { children: props.title }),
          jsx('div', { className: 'card-body', children: props.children }),
        ],
      });
    }

    const app = jsx(Card, {
      title: 'Dashboard Card',
      children: jsx('p', { children: 'Card Content Inside' }),
    });

    const html = renderToString(app);
    assert.strictEqual(
      html,
      '<div class="card"><h2>Dashboard Card</h2><div class="card-body"><p>Card Content Inside</p></div></div>'
    );
  });

  test('renders Fragments (<>...</>) without creating a wrapper tag', () => {
    const fragment = jsx(Fragment, {
      children: [
        jsx('span', { children: 'First' }),
        jsx('span', { children: 'Second' }),
      ],
    });

    const html = renderToString(fragment);
    assert.strictEqual(html, '<span>First</span><span>Second</span>');
  });

  test('supports hyperscript h() syntax', () => {
    const tree = h('div', { class: 'hero' },
      h('h1', null, 'Welcome to BirJS'),
      h('p', null, 'Zero build JSX')
    );

    const html = renderToString(tree);
    assert.strictEqual(html, '<div class="hero"><h1>Welcome to BirJS</h1><p>Zero build JSX</p></div>');
  });

  test('supports async server components with renderToHtml', async () => {
    async function AsyncUserProfile(props: { userId: number }) {
      // Simulate database lookup
      const user = await Promise.resolve({ name: 'Ferdi', role: 'Architect' });
      return jsx('div', {
        className: 'user-profile',
        children: [
          jsx('h3', { children: user.name }),
          jsx('span', { children: user.role }),
        ],
      });
    }

    const html = await renderToHtml(jsx(AsyncUserProfile, { userId: 42 }));
    assert.strictEqual(html, '<div class="user-profile"><h3>Ferdi</h3><span>Architect</span></div>');
  });

  test('Context.render and Context.renderJsx serve JSX responses over HTTP', async () => {
    const app = new Application();

    function WelcomePage(props: { user: string }) {
      return jsx('div', {
        id: 'app',
        children: jsx('h1', { children: `Hello, ${props.user}!` }),
      });
    }

    app.router.get('/welcome-jsx', (ctx) => {
      return ctx.render(jsx(WelcomePage, { user: 'Alice' }));
    });

    app.router.get('/explicit-jsx', (ctx) => {
      return ctx.renderJsx(jsx('p', { children: 'Explicit JSX' }));
    });

    const client = createTestClient(app);

    const res1 = await client.get('/welcome-jsx');
    res1.assertOk();
    assert.strictEqual(res1.headers.get('content-type'), 'text/html; charset=utf-8');
    res1.assertSee('<div id="app"><h1>Hello, Alice!</h1></div>');

    const res2 = await client.get('/explicit-jsx');
    res2.assertOk();
    res2.assertSee('<p>Explicit JSX</p>');

    await client.close();
  });

  test('should resolve string view names to .tsx files via ctx.render("Home", props)', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { defaultViewEngine } = await import('../src/view/engine.js');

    const tempViews = mkdtempSync(join(process.cwd(), '.tmp-jsx-views-'));
    const origViewsDir = defaultViewEngine.getViewsDir();
    defaultViewEngine.setViewsDir(tempViews);

    let client: TestClient | undefined;
    try {
      mkdirSync(join(tempViews, 'admin'), { recursive: true });
      writeFileSync(
        join(tempViews, 'Home.tsx'),
        `import { jsx } from '../src/jsx/index.js';\nexport default function Home(props: { name: string }) { return jsx('h1', { children: 'Hello ' + props.name }); }`,
        'utf-8'
      );
      writeFileSync(
        join(tempViews, 'admin/Dashboard.tsx'),
        `import { jsx } from '../../src/jsx/index.js';\nexport default function Dashboard(props: { count: number }) { return jsx('div', { children: 'Count: ' + props.count }); }`,
        'utf-8'
      );

      const app = new Application();
      app.router.get('/home', (ctx) => ctx.render('Home', { name: 'Ferdi' }));
      app.router.get('/admin', (ctx) => ctx.render('admin.Dashboard', { count: 42 }));

      client = createTestClient(app);

      const homeRes = await client.get('/home');
      homeRes.assertOk().assertSee('<h1>Hello Ferdi</h1>');

      const adminRes = await client.get('/admin');
      adminRes.assertOk().assertSee('<div>Count: 42</div>');
    } finally {
      await client?.close();
      defaultViewEngine.setViewsDir(origViewsDir);
      rmSync(tempViews, { recursive: true, force: true });
    }
  });
});
