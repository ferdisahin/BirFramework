import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { Application } from '../src/core/application.js';
import { app } from '../example/app.js';
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

  test('GET /test-asset.css -> should serve static file from public folder with correct MIME', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const publicDir = path.resolve(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    const filePath = path.join(publicDir, 'test-asset.css');
    fs.writeFileSync(filePath, 'body { background: #000; }', 'utf-8');

    try {
      const res = await fetch(`${baseUrl}/test-asset.css`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('text/css'));
      const text = await res.text();
      assert.strictEqual(text, 'body { background: #000; }');
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
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
