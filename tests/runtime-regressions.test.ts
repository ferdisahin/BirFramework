import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Application, DatabaseConnection, dbConnection, Model, Queue, QueueWorker, ServiceProvider,
} from '../src/index.js';
import { createNewProject } from '../src/cli/commands/new.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('concurrent boot calls wait for registration and provider boot', async () => {
  const registration = deferred();
  const providerStarted = deferred();
  const providerCanFinish = deferred();
  let calls = 0;

  class Provider extends ServiceProvider {
    override register() { return registration.promise; }
    override async boot() {
      calls++;
      providerStarted.resolve();
      await providerCanFinish.promise;
    }
  }

  const app = new Application().register(Provider);
  const first = app.boot();
  let secondFinished = false;
  const second = app.boot().then(() => { secondFinished = true; });
  await Promise.resolve();
  assert.equal(calls, 0);
  registration.resolve();
  await providerStarted.promise;
  assert.equal(secondFinished, false);
  providerCanFinish.resolve();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(app.booted, true);
});

for (const dialect of ['postgres', 'mysql'] as const) {
  test(`${dialect} transaction reserves a connection through commit and rollback`, async () => {
    const db = new DatabaseConnection({ driver: dialect });
    const driver = db.getDriver();
    const statements: string[] = [];
    let released = 0;
    const reserved = {
      async query(sql: string) {
        statements.push(sql);
        return dialect === 'mysql' ? [[{ id: 7 }], []] : { rows: [{ id: 7 }] };
      },
      async execute(sql: string) {
        statements.push(sql);
        return [{ insertId: 7, affectedRows: 1 }, []];
      },
      release() { released++; },
    };
    const pool = {
      async connect() { return reserved; },
      async getConnection() { return reserved; },
      query() { assert.fail('Transaction query went through the pool'); },
      execute() { assert.fail('Transaction execute went through the pool'); },
    };
    Object.defineProperty(driver, dialect === 'mysql' ? 'pool' : 'client', { value: pool });
    const begin = dialect === 'mysql' ? 'START TRANSACTION' : 'BEGIN TRANSACTION';
    const insert = dialect === 'mysql'
      ? 'INSERT INTO fixtures (name) VALUES (?);'
      : 'INSERT INTO fixtures (name) VALUES ($1) RETURNING id';

    const id = await db.transaction(async () => {
      assert.deepEqual(await db.queryOne('SELECT id FROM fixtures'), { id: 7 });
      return (await db.execute('INSERT INTO fixtures (name) VALUES (?);', ['test'])).lastInsertRowid;
    });
    assert.equal(id, 7);
    await assert.rejects(db.transaction(async () => { throw new Error('fixture'); }), /fixture/);
    assert.deepEqual(statements, [begin, 'SELECT id FROM fixtures', insert, 'COMMIT', begin, 'ROLLBACK']);
    assert.equal(released, 2);
  });
}

test('SQLite waits for open transactions before running unrelated reads', async () => {
  const db = new DatabaseConnection({ driver: 'sqlite', database: ':memory:' });
  await db.exec('CREATE TABLE entries (id INT)');
  const inserted = deferred();
  const rollback = deferred();
  const tx = db.transaction(async () => {
    await db.execute('INSERT INTO entries VALUES (1)');
    inserted.resolve();
    await rollback.promise;
    throw new Error('rollback');
  });
  const rejected = assert.rejects(tx, /rollback/);
  await inserted.promise;
  const rows = db.query('SELECT * FROM entries');
  rollback.resolve();
  await rejected;
  assert.deepEqual(await rows, []);
  await db.close();
});

test('queue claims a job once and sends jobs with missing handlers to the failed list', async () => {
  process.env.DB_CONNECTION = 'sqlite';
  process.env.DB_DATABASE = ':memory:';
  const started = deferred();
  const complete = deferred();
  const { Job } = await import('../src/queue/job.js');

  class FixtureJob extends Job {
    override async handle() {
      started.resolve();
      await complete.promise;
    }
  }

  try {
    await Queue.push(new FixtureJob());
    const worker = new QueueWorker();
    const processing = worker.processNext();
    await started.promise;
    assert.equal(await new QueueWorker().processNext(), false);
    complete.resolve();
    assert.equal(await processing, true);

    await dbConnection.execute(
      'INSERT INTO _jobs (queue, name, payload, available_at, created_at) VALUES (?, ?, ?, ?, ?)',
      ['default', 'MissingFixtureJob', '{}', 0, new Date().toISOString()]
    );
    assert.equal(await worker.processNext(), false);
    assert.equal((await Queue.getFailedJobs())[0]?.name, 'MissingFixtureJob');
    assert.deepEqual(await dbConnection.query('SELECT * FROM _jobs'), []);
  } finally {
    complete.resolve();
    await dbConnection.close();
  }
});

test('whereIn with no values returns no rows even when the table contains data', async () => {
  process.env.DB_CONNECTION = 'sqlite';
  process.env.DB_DATABASE = ':memory:';
  class Entry extends Model {
    static override table = 'entries';
  }
  try {
    await dbConnection.exec('CREATE TABLE entries (id INTEGER PRIMARY KEY)');
    await dbConnection.execute('INSERT INTO entries (id) VALUES (1)');
    assert.deepEqual(await Entry.query().whereIn('id', []).get(), []);
  } finally {
    await dbConnection.close();
  }
});

test('JavaScript JSX scaffold generates valid entrypoints and resolves JSX pages', async () => {
  const originalDirectory = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), 'bir-scaffold-'));
  try {
    process.chdir(directory);
    await createNewProject('fixture', 'js', 'css', 'hotwire', 'jsx');
    execFileSync(process.execPath, ['--check', resolve('fixture/app.js')]);
    execFileSync(process.execPath, ['--check', resolve('fixture/api/index.js')]);
    const client = readFileSync('fixture/resources/js/app.tsx', 'utf8');
    assert.ok(client.includes('views/pages/**/*.jsx'));
    assert.ok(client.includes('${normalized}.jsx'));
    assert.ok(readFileSync('fixture/resources/css/app.css', 'utf8').length > 0);
  } finally {
    process.chdir(originalDirectory);
    rmSync(directory, { recursive: true, force: true });
  }
});
