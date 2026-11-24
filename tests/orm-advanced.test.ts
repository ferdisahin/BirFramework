import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { dbConnection } from '../src/database/connection.js';
import { Model } from '../src/database/model.js';

class WalletAccount extends Model {
  public static override table = 'wallet_accounts';
  public static override fillable = ['email', 'balance'];
}

class Role extends Model {
  public static override table = 'roles';
  public static override fillable = ['name'];
}

class Member extends Model {
  public static override table = 'members';
  public static override fillable = ['username'];

  public roles() {
    return this.belongsToMany(Role, 'member_role', 'member_id', 'role_id');
  }
}

describe('Phase 2: ORM increment/decrement, firstOrCreate, updateOrCreate, chunk, belongsToMany', () => {
  before(async () => {
    await dbConnection.connect(':memory:');
    await dbConnection.execute(`DROP TABLE IF EXISTS wallet_accounts`);
    await dbConnection.execute(`DROP TABLE IF EXISTS members`);
    await dbConnection.execute(`DROP TABLE IF EXISTS roles`);
    await dbConnection.execute(`DROP TABLE IF EXISTS member_role`);
    await dbConnection.execute(`
      CREATE TABLE wallet_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        balance INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      )
    `);
    await dbConnection.execute(`
      CREATE TABLE members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);
    await dbConnection.execute(`
      CREATE TABLE roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);
    await dbConnection.execute(`
      CREATE TABLE member_role (
        member_id INTEGER,
        role_id INTEGER
      )
    `);
  });

  after(async () => {
    await dbConnection.close();
  });

  test('QueryBuilder increment and decrement update numeric columns atomically', async () => {
    const acc = await WalletAccount.create({ email: 'alice@example.com', balance: 100 });
    await WalletAccount.where('id', '=', acc.id).increment('balance', 50);
    await WalletAccount.where('id', '=', acc.id).decrement('balance', 30);

    const fresh = await WalletAccount.find(acc.id);
    assert.strictEqual(fresh?.balance, 120);
  });

  test('Model.firstOrCreate and Model.updateOrCreate behave idempotently', async () => {
    const created = await WalletAccount.firstOrCreate(
      { email: 'bob@example.com' },
      { balance: 250 }
    );
    assert.strictEqual(created.balance, 250);

    const existing = await WalletAccount.firstOrCreate(
      { email: 'bob@example.com' },
      { balance: 999 }
    );
    assert.strictEqual(existing.id, created.id);
    assert.strictEqual(existing.balance, 250);

    const updated = await WalletAccount.updateOrCreate(
      { email: 'bob@example.com' },
      { balance: 500 }
    );
    assert.strictEqual(updated.id, created.id);
    assert.strictEqual(updated.balance, 500);
  });

  test('Model.chunk processes records in bounded batches', async () => {
    for (let i = 1; i <= 5; i++) {
      await WalletAccount.create({ email: `batch${i}@example.com`, balance: i * 10 });
    }

    const batches: number[] = [];
    await WalletAccount.where('email', 'LIKE', 'batch%').chunk(2, (rows) => {
      batches.push(rows.length);
    });

    assert.deepStrictEqual(batches, [2, 2, 1]);
  });

  test('belongsToMany supports attach, get, detach, and sync', async () => {
    const member = await Member.create({ username: 'ferdi' });
    const adminRole = await Role.create({ name: 'admin' });
    const billingRole = await Role.create({ name: 'billing' });
    const supportRole = await Role.create({ name: 'support' });

    await member.roles().attach([adminRole.id, billingRole.id]);
    let roles = await member.roles().get();
    assert.strictEqual(roles.length, 2);

    await member.roles().detach(billingRole.id);
    roles = await member.roles().get();
    assert.strictEqual(roles.length, 1);
    assert.strictEqual(roles[0]?.name, 'admin');

    await member.roles().sync([supportRole.id, billingRole.id]);
    roles = await member.roles().get();
    assert.strictEqual(roles.length, 2);
    assert.deepStrictEqual(roles.map((r: any) => r.name).sort(), ['billing', 'support']);
  });
});
