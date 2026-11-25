import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dialect = process.env.BIR_TEST_DIALECT;
const url = process.env.BIR_TEST_DATABASE_URL;
if (!['postgres', 'mysql'].includes(dialect) || !url || new URL(url).pathname !== '/birtest') {
  throw new Error('Set BIR_TEST_DIALECT and BIR_TEST_DATABASE_URL for a dedicated birtest database.');
}
process.env.DB_CONNECTION = dialect;
process.env.DATABASE_URL = url;
const { DB, dbConnection, Migrator, Schema, Queue, QueueWorker, Job, DatabaseSessionStore, Session } = await import('../dist/index.js');

const temp = mkdtempSync(join(tmpdir(), 'bir-db-smoke-'));
const firstMigration = '001_create_smoke_items.js';
const secondMigration = '002_create_smoke_batches.js';
writeFileSync(join(temp, 'package.json'), '{"type":"module"}');
const entry = new URL('../dist/index.js', import.meta.url).href;

function writeMigration(name, table) {
  writeFileSync(join(temp, name), `import { Schema } from '${entry}';
export default {
  up: () => Schema.create('${table}', (table) => { table.id(); table.string('name'); }),
  down: () => Schema.dropIfExists('${table}'),
};
`);
}

const migrator = new Migrator(temp);
let processed = 0;
class SmokeJob extends Job {
  handle() { processed++; }
}

try {
  // Clean only the dedicated, disposable database used by this script.
  for (const table of ['bir_smoke_items', 'bir_smoke_batches', '_migrations', '_jobs', '_failed_jobs', '_sessions']) {
    await Schema.dropIfExists(table);
  }

  writeMigration(firstMigration, 'bir_smoke_items');
  assert.deepEqual(await migrator.status(), [{ name: firstMigration, status: 'pending', batch: null }]);
  assert.equal(await Schema.hasTable('_migrations'), false);
  assert.deepEqual(await migrator.run(), [firstMigration]);

  writeMigration(secondMigration, 'bir_smoke_batches');
  assert.deepEqual(await migrator.run(), [secondMigration]);
  assert.deepEqual(await migrator.status(), [
    { name: firstMigration, status: 'applied', batch: 1 },
    { name: secondMigration, status: 'applied', batch: 2 },
  ]);

  await DB.transaction(async () => {
    const { lastInsertRowid } = await DB.table('bir_smoke_items').insert({ name: 'committed' });
    assert.ok(Number(lastInsertRowid) > 0);
    assert.equal((await DB.table('bir_smoke_items').forUpdate().first()).name, 'committed');
  });
  await assert.rejects(DB.transaction(async () => {
    await DB.table('bir_smoke_items').insert({ name: 'rolled back' });
    throw new Error('rollback fixture');
  }), /rollback fixture/);
  assert.equal(await DB.table('bir_smoke_items').count(), 1);

  const session = new Session();
  const sessions = new DatabaseSessionStore();
  await sessions.set(session.set('status', 'created'));
  await sessions.set(session.set('status', 'updated'));
  assert.equal((await sessions.get(session.id)).get('status'), 'updated');

  assert.ok(await Queue.push(new SmokeJob()) > 0);
  await Promise.all([new QueueWorker().processNext(), new QueueWorker().processNext()]);
  assert.equal(processed, 1);
  assert.equal(await DB.table('_jobs').count(), 0);

  assert.deepEqual(await migrator.rollback(), [secondMigration]);
  assert.equal(await Schema.hasTable('bir_smoke_items'), true);
  assert.equal(await Schema.hasTable('bir_smoke_batches'), false);
  assert.deepEqual(await migrator.rollback(), [firstMigration]);
  assert.equal(await Schema.hasTable('bir_smoke_items'), false);
  console.log(`${dialect}: migration status, two batches, rollback, transactions, sessions and queue passed.`);
} finally {
  await dbConnection.close();
  rmSync(temp, { recursive: true, force: true });
}
