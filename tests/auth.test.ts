import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { Hash, CookieManager, Session, Auth, Model, Schema, dbConnection, type Context } from '../src/index.js';

class User extends Model {
  public static override table = 'users';
}

describe('BirFramework Hash & Security Tests', () => {
  test('Hash.make and Hash.check should verify correct password and reject wrong one', () => {
    const password = 'SecretPassword123!';
    const hashed = Hash.make(password);

    assert.ok(hashed.startsWith('scrypt:'));
    assert.strictEqual(Hash.check(password, hashed), true);
    assert.strictEqual(Hash.check('WrongPassword', hashed), false);
    assert.strictEqual(Hash.check('', hashed), false);
  });
});

describe('BirFramework Cookie & Session Tests', () => {
  const cookieManager = new CookieManager('test-app-secret-key-32-chars-long!');

  test('Cookie signing and unsigning should verify tampered cookies', () => {
    const rawVal = 'session_id_xyz_123';
    const signed = cookieManager.sign(rawVal);

    assert.ok(signed.includes('.'));
    assert.strictEqual(cookieManager.unsign(signed), rawVal);

    // Tampered value
    const tampered = signed.replace('xyz', 'hacked');
    assert.strictEqual(cookieManager.unsign(tampered), null);
  });

  test('Session should set, get, flash and clear values', () => {
    const session = new Session('session_1');

    session.set('user_id', 42);
    session.flash('success_message', 'Welcome back!');

    assert.strictEqual(session.get('user_id'), 42);
    assert.strictEqual(session.get('success_message'), 'Welcome back!');
    // Flash message is cleared after single read
    assert.strictEqual(session.get('success_message'), undefined);
    assert.strictEqual(session.get('user_id'), 42);
  });
});

describe('BirFramework Auth Service Tests', () => {
  before(async () => {
    process.env.DB_DATABASE = ':memory:';
    dbConnection.connect();

    await Schema.create('users', (table) => {
      table.id();
      table.string('name');
      table.string('email').unique();
      table.string('password');
      table.timestamps();
    });
  });

  after(async () => {
    await Schema.dropIfExists('users');
    await dbConnection.close();
  });

  test('Auth.attempt should authenticate valid credentials and reject invalid ones', async () => {
    const hashedPassword = Hash.make('mypassword');
    await User.create({
      name: 'Alice',
      email: 'alice@example.com',
      password: hashedPassword,
    });

    const mockCtx: Partial<Context> = {
      session: new Session(),
    };

    // 1. Wrong password
    const failed = await Auth.attempt(
      mockCtx as Context,
      { email: 'alice@example.com', password: 'wrong' },
      User
    );
    assert.strictEqual(failed, false);
    assert.strictEqual(Auth.check(mockCtx as Context), false);

    // 2. Correct password
    const success = await Auth.attempt(
      mockCtx as Context,
      { email: 'alice@example.com', password: 'mypassword' },
      User
    );
    assert.strictEqual(success, true);
    assert.strictEqual(Auth.check(mockCtx as Context), true);
    assert.strictEqual(Auth.id(mockCtx as Context), 1);

    // 3. Retrieve user
    const authenticatedUser = await Auth.user<User>(mockCtx as Context, User);
    assert.ok(authenticatedUser);
    assert.strictEqual(authenticatedUser.name, 'Alice');

    // 4. Logout
    Auth.logout(mockCtx as Context);
    assert.strictEqual(Auth.check(mockCtx as Context), false);
  });
});
