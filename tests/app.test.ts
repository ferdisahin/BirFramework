import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { Application } from '../src/core/application.js';
import { app } from '../example/app.js';
import { defaultViewEngine } from '../src/view/engine.js';
import { paginate } from '../src/pagination/index.js';

describe('BirFramework HTTP & Router Tests', () => {
  let server: Server;
  const PORT = 3999;
  const baseUrl = `http://127.0.0.1:${PORT}`;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(PORT, '127.0.0.1', () => resolve());
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  test('GET / -> should return welcome JSON response', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    const json = (await res.json()) as any;
    assert.strictEqual(json.framework, 'BirFramework ⚡');
    assert.strictEqual(json.status, 'active');
  });

  test('GET /users/:id -> should correctly parse URL parameters', async () => {
    const res = await fetch(`${baseUrl}/users/123?filter=active`);
    assert.strictEqual(res.status, 200);
    const json = (await res.json()) as any;
    assert.strictEqual(json.userId, '123');
    assert.strictEqual(json.query.filter, 'active');
  });

  test('POST /api/v1/echo -> should parse and return JSON body', async () => {
    const payload = { title: 'Next-Gen Framework', score: 100 };
    const res = await fetch(`${baseUrl}/api/v1/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.strictEqual(res.status, 200);
    const json = (await res.json()) as any;
    assert.deepStrictEqual(json.received, payload);
  });

  test('GET /posts -> should invoke Resource Controller index method', async () => {
    const res = await fetch(`${baseUrl}/posts`);
    assert.strictEqual(res.status, 200);
    const posts = (await res.json()) as any[];
    assert.strictEqual(posts.length, 2);
    assert.strictEqual(posts[0].id, 1);
  });

  test('GET /ai/stream -> should stream SSE tokens', async () => {
    const res = await fetch(`${baseUrl}/ai/stream`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'text/event-stream');
    const text = await res.text();
    assert.ok(text.includes('BirFramework'));
    assert.ok(text.includes('is ready!'));
  });

  test('GET /undefined-route -> should return 404 Not Found', async () => {
    const res = await fetch(`${baseUrl}/undefined-route`);
    assert.strictEqual(res.status, 404);
  });
});

describe('BirFramework Modern Blade Component & Slot Tests', () => {
  test('should render <x-layouts.app> with title prop and default slot', () => {
    const template = `
      <x-layouts.app title="Hello World">
        <p>Main body content</p>
      </x-layouts.app>
    `;

    const compiled = defaultViewEngine.compile(template);
    assert.ok(compiled.includes('<title>Hello World</title>'));
    assert.ok(compiled.includes('<p>Main body content</p>'));
  });

  test('should support named slots <x-slot name="after"> and <x-slot:header>', () => {
    const template = `
      <x-layouts.app title="Dashboard">
        <h1>Welcome Back</h1>
        <x-slot:header>
          <nav>Top Navigation</nav>
        </x-slot:header>
        <x-slot name="after">
          <p>Footer Content</p>
        </x-slot>
      </x-layouts.app>
    `;

    const compiled = defaultViewEngine.compile(template);
    assert.ok(compiled.includes('<title>Dashboard</title>'));
    assert.ok(compiled.includes('<nav>Top Navigation</nav>'));
    assert.ok(compiled.includes('<h1>Welcome Back</h1>'));
    assert.ok(compiled.includes('<p>Footer Content</p>'));
  });

  test('should support nested components like <x-card>', () => {
    const template = `
      <x-card title="Analytics">
        <span>Active Users: 120</span>
      </x-card>
    `;

    const compiled = defaultViewEngine.compile(template);
    assert.ok(compiled.includes('<h3>Analytics</h3>'));
    assert.ok(compiled.includes('Active Users: 120'));
  });
});

describe('BirFramework View Engine & Directive Tests', () => {
  test('should compile Blade-like variable interpolation and foreach loops', () => {
    const template = `
      <h1>{{ title }}</h1>
      <ul>
        @foreach(item in items)
          <li>{{ item.name }}</li>
        @endforeach
      </ul>
    `;

    const compiled = defaultViewEngine.compile(template, {
      title: 'Products',
      items: [{ name: 'Laptop' }, { name: 'Keyboard' }],
    });

    assert.ok(compiled.includes('<h1>Products</h1>'));
    assert.ok(compiled.includes('<li>Laptop</li>'));
    assert.ok(compiled.includes('<li>Keyboard</li>'));
  });

  test('should support Laravel-style @foreach($items as $item) and key-value loops', () => {
    const template = `
      <ul>
        @foreach($items as $key => $item)
          <li>{{ key }}: {{ item }}</li>
        @endforeach
      </ul>
      <div>
        @foreach($items as $item)
          <span>{{ item }}</span>
        @endforeach
      </div>
    `;

    const compiled = defaultViewEngine.compile(template, {
      items: ['Apple', 'Banana'],
    });

    assert.ok(compiled.includes('<li>0: Apple</li>'));
    assert.ok(compiled.includes('<li>1: Banana</li>'));
    assert.ok(compiled.includes('<span>Apple</span>'));
    assert.ok(compiled.includes('<span>Banana</span>'));
  });

  test('should support HTML escaping and unescaped {!! !!} raw tags', () => {
    const template = `Safe: {{ safe }} | Raw: {!! raw !!}`;
    const compiled = defaultViewEngine.compile(template, {
      safe: '<script>alert(1)</script>',
      raw: '<strong>Bold</strong>',
    });

    assert.ok(compiled.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(compiled.includes('<strong>Bold</strong>'));
  });

  test('should compile {!! bir_scripts() !!} into Instant Turbo navigation scripts', () => {
    const template = `<html><body><h1>App</h1>{!! bir_scripts() !!}</body></html>`;
    const compiled = defaultViewEngine.compile(template);

    assert.ok(compiled.includes('bir-turbo-progress'));
    assert.ok(compiled.includes('bir-turbo-script'));
    assert.ok(compiled.includes('shouldIntercept'));
  });

  test('should compile Blade @markdown ... @endmarkdown blocks into HTML', () => {
    const template = `
      @markdown
      # Installation Guide
      This is **bold** text and a [link](https://birframework.dev).

      \`\`\`ts
      const app = new Application();
      \`\`\`
      @endmarkdown
    `;
    const compiled = defaultViewEngine.compile(template);

    assert.ok(compiled.includes('<h1>Installation Guide</h1>'));
    assert.ok(compiled.includes('<strong>bold</strong>'));
    assert.ok(compiled.includes('<a href="https://birframework.dev">link</a>'));
    assert.ok(compiled.includes('<pre><code class="language-ts">'));
    assert.ok(compiled.includes('const app = new Application();'));
  });

  test('should compile @markdown(variable) expression into HTML', () => {
    const template = `<div>@markdown(article.body)</div>`;
    const compiled = defaultViewEngine.compile(template, {
      article: { body: '## Subtitle\n- First item\n- Second item\n\n| Command | Description |\n| --- | --- |\n| bir new | Create app |' }
    });

    assert.ok(compiled.includes('<h2>Subtitle</h2>'));
    assert.ok(compiled.includes('<li>First item</li>'));
    assert.ok(compiled.includes('<li>Second item</li>'));
    assert.ok(compiled.includes('<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td>bir new</td><td>Create app</td></tr></tbody></table>'));
  });
});

describe('BirFramework Pagination Tests', () => {
  test('should slice in-memory data and generate correct metadata', () => {
    const mockUsers = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` }));

    const page1 = paginate(mockUsers, { page: 1, perPage: 10, path: '/users' });
    assert.strictEqual(page1.data.length, 10);
    assert.strictEqual(page1.meta.total, 25);
    assert.strictEqual(page1.meta.lastPage, 3);
    assert.strictEqual(page1.meta.hasMore, true);
    assert.strictEqual(page1.meta.hasPrevious, false);

    const page3 = paginate(mockUsers, { page: 3, perPage: 10, path: '/users' });
    assert.strictEqual(page3.data.length, 5);
    assert.strictEqual(page3.meta.hasMore, false);
    assert.strictEqual(page3.meta.hasPrevious, true);

    const linksHtml = page1.links();
    assert.ok(linksHtml.includes('bir-pagination'));
    assert.ok(linksHtml.includes('Previous'));
    assert.ok(linksHtml.includes('Next'));
    assert.ok(linksHtml.includes('page=2'));
  });
});

describe('BirFramework Port Auto-Increment Tests', () => {
  test('should automatically increment port when EADDRINUSE occurs', async () => {
    const appA = new Application();
    const appB = new Application();
    const testPort = 4567;

    const serverA = await new Promise<any>((resolve) => {
      const s = appA.listen(testPort, '127.0.0.1', () => resolve(s));
    });

    let assignedPort = 0;
    const serverB = await new Promise<any>((resolve) => {
      const s = appB.listen(testPort, '127.0.0.1', (actualPort) => {
        assignedPort = actualPort;
        resolve(s);
      });
    });

    assert.strictEqual(assignedPort, testPort + 1);

    await new Promise<void>((r) => serverA.close(() => r()));
    await new Promise<void>((r) => serverB.close(() => r()));
  });
});
