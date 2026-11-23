import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { Schema, Model, DB, dbConnection, PostgresDriver, MysqlDriver } from '../src/index.js';

class User extends Model {
  public static override table = 'users';
}

class Product extends Model {
  public static override table = 'products';
}

describe('BirFramework Database & ORM Tests', () => {
  before(async () => {
    // Connect in-memory for testing
    process.env.DB_DATABASE = ':memory:';
    dbConnection.connect();

    // Create test tables using Schema Builder
    await Schema.create('users', (table) => {
      table.id();
      table.string('name');
      table.string('email').unique();
      table.string('role').default('user');
      table.timestamps();
    });

    await Schema.create('products', (table) => {
      table.id();
      table.string('title');
      table.float('price');
      table.timestamps();
    });
  });

  after(async () => {
    await Schema.dropIfExists('users');
    await Schema.dropIfExists('products');
    await dbConnection.close();
  });

  test('SchemaBuilder should create table and check hasTable', async () => {
    assert.strictEqual(await Schema.hasTable('users'), true);
    assert.strictEqual(await Schema.hasTable('products'), true);
    assert.strictEqual(await Schema.hasTable('non_existing_table'), false);
  });

  test('Model.create should insert record and set timestamps and primary key', async () => {
    const user = await User.create({
      name: 'Ferdi Sahin',
      email: 'ferdi@example.com',
      role: 'admin',
    });

    assert.strictEqual(user.id, 1);
    assert.strictEqual(user.name, 'Ferdi Sahin');
    assert.strictEqual(user.email, 'ferdi@example.com');
    assert.strictEqual(user.role, 'admin');
    assert.ok(user.created_at);
    assert.ok(user.updated_at);
  });

  test('Model.find and Model.where should retrieve records', async () => {
    const found = await User.find(1);
    assert.ok(found);
    assert.strictEqual(found.name, 'Ferdi Sahin');

    const admin = await User.where('role', '=', 'admin').first();
    assert.ok(admin);
    assert.strictEqual(admin.email, 'ferdi@example.com');

    const notFound = await User.find(999);
    assert.strictEqual(notFound, null);
  });

  test('Model.update and model.save should update record in database', async () => {
    const user = await User.find(1);
    assert.ok(user);

    await user.update({ name: 'Ferdi S.' });
    assert.strictEqual(user.name, 'Ferdi S.');

    // Fetch fresh from database
    const fresh = await User.find(1);
    assert.strictEqual(fresh?.name, 'Ferdi S.');
  });

  test('Model.paginate should slice and return LengthAwarePaginator', async () => {
    for (let i = 1; i <= 15; i++) {
      await Product.create({ title: `Product #${i}`, price: i * 10 });
    }

    const paginated = await Product.paginate({ page: 1, perPage: 5, path: '/products' });
    assert.strictEqual(paginated.data.length, 5);
    assert.strictEqual(paginated.meta.total, 15);
    assert.strictEqual(paginated.meta.lastPage, 3);
    assert.strictEqual(paginated.meta.hasMore, true);

    const page2 = await Product.paginate({ page: 2, perPage: 5 });
    assert.strictEqual(page2.data.length, 5);
    assert.strictEqual(page2.meta.currentPage, 2);

    const links = paginated.links();
    assert.ok(links.includes('bir-pagination'));
    assert.ok(links.includes('page=2'));
  });

  test('Model.delete should remove record from database', async () => {
    const user = await User.find(1);
    assert.ok(user);

    const deleted = await user.delete();
    assert.strictEqual(deleted, true);

    const afterDelete = await User.find(1);
    assert.strictEqual(afterDelete, null);
  });

  test('PostgreSQL driver should translate SQL and parameter bindings', () => {
    const pg = new PostgresDriver();
    const converted = pg.translateSql('SELECT * FROM `users` WHERE `id` = ? AND `email` = ?;');
    assert.strictEqual(converted, 'SELECT * FROM "users" WHERE "id" = $1 AND "email" = $2;');
  });

  test('MySQL driver should have mysql dialect', () => {
    const mysql = new MysqlDriver();
    assert.strictEqual(mysql.dialect, 'mysql');
  });

  test('DB.transaction should commit on success and rollback on error', async () => {
    // Successful transaction
    await DB.transaction(async () => {
      await Product.create({ title: 'Transaction Product 1', price: 99 });
      await Product.create({ title: 'Transaction Product 2', price: 199 });
    });

    const p1 = await Product.where('title', '=', 'Transaction Product 1').first();
    assert.ok(p1);

    // Failing transaction (rollback)
    try {
      await DB.transaction(async () => {
        await Product.create({ title: 'Should Be Rolled Back', price: 50 });
        throw new Error('Payment gateway failed');
      });
    } catch {
      // Expected rollback
    }

    const rolledBack = await Product.where('title', '=', 'Should Be Rolled Back').first();
    assert.strictEqual(rolledBack, null);
  });
});
