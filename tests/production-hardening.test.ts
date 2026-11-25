import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
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
  });
});
