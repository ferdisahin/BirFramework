import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Application } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';
import { FileSessionStore, DatabaseSessionStore, sessionMiddleware, sessionStore, setSessionStore } from '../src/auth/session.js';
import { PostgresDriver } from '../src/database/drivers/postgres.js';
import { QueryBuilder } from '../src/database/query.js';
import { dbConnection } from '../src/database/connection.js';
import { ScheduleEvent } from '../src/schedule/event.js';
import { createNewProject } from '../src/cli/commands/new.js';
import { serveStatic } from '../src/http/static.js';
import { compress } from '../src/http/middlewares.js';
import { readFileSync } from 'node:fs';

describe('Production Hardening Tests (v0.5.27)', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    setSessionStore(null);
    sessionStore.clear();
    for (const dir of tempDirs.splice(0)) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  });

  test('FileSessionStore persists sessions across in-memory store resets (restarts)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bir-sess-'));
    tempDirs.push(dir);

    const app = new Application();
    app.use(sessionMiddleware({ driver: 'file', storeDir: dir, secret: 'test-secret-key-123456' }));
    app.router.post('/login', (ctx) => {
      ctx.session!.set('userId', 99);
      return ctx.json({ ok: true });
    });
    app.router.get('/me', (ctx) => {
      return ctx.json({ userId: ctx.session!.get('userId', null) });
    });

    const client = createTestClient(app);
    try {
      const loginRes = await client.post('/login');
      loginRes.assertOk();

      // Simulate full server restart by wiping in-memory sessionStore Map
      sessionStore.clear();

      const meRes = await client.get('/me');
      meRes.assertOk();
      assert.strictEqual(meRes.json().userId, 99);
    } finally {
      await client.close();
    }
  });

  test('DatabaseSessionStore persists sessions in _sessions table', async () => {
    await dbConnection.connect(':memory:');
    const store = new DatabaseSessionStore();
    setSessionStore(store);

    const app = new Application();
    app.use(sessionMiddleware({ driver: 'database', secret: 'db-secret-key-123456' }));
    app.router.post('/set', (ctx) => {
      ctx.session!.set('cartCount', 3);
      return ctx.json({ ok: true });
    });
    app.router.get('/get', (ctx) => {
      return ctx.json({ cartCount: ctx.session!.get('cartCount', 0) });
    });

    const client = createTestClient(app);
    try {
      await client.post('/set');
      // Wait a tick for async persist
      await new Promise((r) => setTimeout(r, 20));
      sessionStore.clear();

      const res = await client.get('/get');
      res.assertOk();
      assert.strictEqual(res.json().cartCount, 3);
    } finally {
      await client.close();
      await dbConnection.close();
    }
  });

  test('PostgresDriver.translateSql preserves ? inside quoted strings', () => {
    const pg = new PostgresDriver({ driver: 'postgres' });
    const sql = pg.translateSql("SELECT * FROM `tickets` WHERE `subject` = 'Why is this broken?' AND `id` = ? AND `status` = ?");
    assert.strictEqual(
      sql,
      'SELECT * FROM "tickets" WHERE "subject" = \'Why is this broken?\' AND "id" = $1 AND "status" = $2'
    );
  });

  test('QueryBuilder.forUpdate appends FOR UPDATE for non-sqlite dialects', () => {
    const mockPgConn: any = { dialect: 'postgres' };
    const qb = new QueryBuilder('invoices', mockPgConn).where('id', '=', 10).forUpdate();
    const { sql } = qb.toSql();
    assert.ok(sql.endsWith('FOR UPDATE'));
  });

  test('ScheduleEvent.withoutOverlapping enforces cross-process lock file', async () => {
    const lockDir = mkdtempSync(join(tmpdir(), 'bir-lock-'));
    tempDirs.push(lockDir);

    let runs1 = 0;
    let runs2 = 0;
    let release!: () => void;
    const hold = new Promise<void>((r) => {
      release = r;
    });

    const worker1 = new ScheduleEvent(async () => {
      runs1++;
      await hold;
    }, 'InvoiceRenewal').withoutOverlapping(60, lockDir);

    const worker2 = new ScheduleEvent(async () => {
      runs2++;
    }, 'InvoiceRenewal').withoutOverlapping(60, lockDir);

    const p1 = worker1.run();
    assert.strictEqual(worker2.isDue(new Date()), false);
    await worker2.run();
    assert.strictEqual(runs1, 1);
    assert.strictEqual(runs2, 0);

    release();
    await p1;

    // After worker1 finishes, worker2 can acquire lock and run
    await worker2.run();
    assert.strictEqual(runs2, 1);
  });

  test('Scaffolded bir-inertia.tsx includes useForm hook and FormData upload support', async () => {
    const appDir = join(process.cwd(), 'test-useform-app');
    tempDirs.push(appDir);

    await createNewProject('test-useform-app', 'ts', 'tailwind', 'hotwire', 'jsx');
    const inertiaClient = readFileSync(join(appDir, 'resources/js/bir-inertia.tsx'), 'utf-8');
    assert.ok(inertiaClient.includes('export function useForm'));
    assert.ok(inertiaClient.includes('instanceof FormData'));
    assert.ok(inertiaClient.includes('Component?.layout'));
    assert.ok(inertiaClient.includes('preserveScroll'));
    assert.ok(inertiaClient.includes('export function Head'));
    assert.ok(inertiaClient.includes('export function useNavigation'));
    assert.ok(inertiaClient.includes('bir-progress-bar'));
  });

  test('serveStatic supports HTTP Range (206 Partial Content), 416, and audio MIME types', async () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'bir-static-'));
    tempDirs.push(publicDir);
    writeFileSync(join(publicDir, 'track.mp3'), '0123456789ABCDEF');

    const app = new Application();
    app.use(serveStatic({ publicDir }));
    const client = createTestClient(app);

    try {
      const fullRes = await client.get('/track.mp3');
      assert.strictEqual(fullRes.status, 200);
      assert.strictEqual(fullRes.headers.get('accept-ranges'), 'bytes');
      assert.strictEqual(fullRes.headers.get('content-type'), 'audio/mpeg');
      assert.strictEqual(fullRes.text(), '0123456789ABCDEF');

      const partialRes = await client.get('/track.mp3', { headers: { Range: 'bytes=2-5' } });
      assert.strictEqual(partialRes.status, 206);
      assert.strictEqual(partialRes.headers.get('content-range'), 'bytes 2-5/16');
      assert.strictEqual(partialRes.headers.get('content-length'), '4');
      assert.strictEqual(partialRes.text(), '2345');

      const suffixRes = await client.get('/track.mp3', { headers: { Range: 'bytes=-4' } });
      assert.strictEqual(suffixRes.status, 206);
      assert.strictEqual(suffixRes.headers.get('content-range'), 'bytes 12-15/16');
      assert.strictEqual(suffixRes.text(), 'CDEF');

      const invalidRes = await client.get('/track.mp3', { headers: { Range: 'bytes=99-120' } });
      assert.strictEqual(invalidRes.status, 416);
      assert.strictEqual(invalidRes.headers.get('content-range'), 'bytes */16');

      const etag = fullRes.headers.get('etag');
      assert.ok(etag && etag.startsWith('W/"'));
      const notModifiedRes = await client.get('/track.mp3', { headers: { 'If-None-Match': etag } });
      assert.strictEqual(notModifiedRes.status, 304);
    } finally {
      await client.close();
    }
  });

  test('ctx.fileStream() streams protected files with Range (206) and returns 404 when missing', async () => {
    const mediaDir = mkdtempSync(join(tmpdir(), 'bir-media-'));
    tempDirs.push(mediaDir);
    const audioPath = join(mediaDir, 'premium.mp3');
    writeFileSync(audioPath, 'ABCDEFGHIJKLMNOP');

    const app = new Application();
    app.router.get('/stream/:id', async (ctx) => {
      if (ctx.params.id === 'missing') {
        await ctx.fileStream(join(mediaDir, 'nope.mp3'));
        return;
      }
      await ctx.fileStream(audioPath);
    });

    const client = createTestClient(app);
    try {
      const partialRes = await client.get('/stream/1', { headers: { Range: 'bytes=4-7' } });
      assert.strictEqual(partialRes.status, 206);
      assert.strictEqual(partialRes.headers.get('content-type'), 'audio/mpeg');
      assert.strictEqual(partialRes.headers.get('content-range'), 'bytes 4-7/16');
      assert.strictEqual(partialRes.text(), 'EFGH');

      const missingRes = await client.get('/stream/missing');
      assert.strictEqual(missingRes.status, 404);
    } finally {
      await client.close();
    }
  });

  test('compress() middleware compresses large JSON responses and skips small ones', async () => {
    const app = new Application();
    app.use(compress({ threshold: 100 }));
    app.router.get('/large', (ctx) => {
      ctx.json({ message: 'BirFramework '.repeat(30) });
    });
    app.router.get('/small', (ctx) => {
      ctx.json({ ok: true });
    });

    const client = createTestClient(app);
    try {
      const largeRes = await client.get('/large', { headers: { 'Accept-Encoding': 'gzip' } });
      assert.strictEqual(largeRes.status, 200);
      assert.strictEqual(largeRes.headers.get('content-encoding'), 'gzip');
      assert.ok(largeRes.json().message.startsWith('BirFramework'));

      const smallRes = await client.get('/small', { headers: { 'Accept-Encoding': 'gzip' } });
      assert.strictEqual(smallRes.status, 200);
      assert.strictEqual(smallRes.headers.get('content-encoding'), null);
      assert.deepStrictEqual(smallRes.json(), { ok: true });
    } finally {
      await client.close();
    }
  });

  test('ctx.inertia() renders escaped SSR SEO meta tags (description, canonical, og, twitter, custom)', async () => {
    const app = new Application();
    app.router.get('/tld/com', async (ctx) => {
      await ctx.inertia(
        'TldDetail',
        { tld: 'com' },
        {
          lang: 'tr',
          title: '.com Domain Fiyatları "2026"',
          description: 'En ucuz .com kayıt & yenileme fiyatları',
          canonical: 'https://tldlist.tr/tld/com',
          meta: {
            robots: 'index, follow',
            og: {
              image: 'https://tldlist.tr/og/com.png',
              siteName: 'TLDList',
            },
            twitter: {
              card: 'summary_large_image',
            },
            tags: [{ name: 'keywords', content: 'domain, tld, .com' }],
          },
          ssr: false,
        }
      );
    });

    const client = createTestClient(app);
    try {
      const res = await client.get('/tld/com');
      assert.strictEqual(res.status, 200);
      const html = res.text();
      assert.ok(html.includes('<html lang="tr">'));
      assert.ok(html.includes('<title>.com Domain Fiyatları &quot;2026&quot;</title>'));
      assert.ok(html.includes('<meta name="description" content="En ucuz .com kayıt &amp; yenileme fiyatları" />'));
      assert.ok(html.includes('<link rel="canonical" href="https://tldlist.tr/tld/com" />'));
      assert.ok(html.includes('<meta property="og:title" content=".com Domain Fiyatları &quot;2026&quot;" />'));
      assert.ok(html.includes('<meta property="og:image" content="https://tldlist.tr/og/com.png" />'));
      assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image" />'));
      assert.ok(html.includes('<meta name="keywords" content="domain, tld, .com" />'));
    } finally {
      await client.close();
    }
  });
});
