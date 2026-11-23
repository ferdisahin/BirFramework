import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import {
  PersonalAccessToken,
  HasApiTokens,
  Auth,
  auth,
  hasAbility,
  Model,
  Schema,
  dbConnection,
  Router,
  type Context
} from '../src/index.js';

class User extends HasApiTokens(Model) {
  public static override table = 'users';
}

describe('BirFramework API Tokens (Personal Access Tokens & Bearer Auth) Tests', () => {
  before(async () => {
    process.env.DB_DATABASE = ':memory:';
    dbConnection.connect();

    await Schema.create('users', (table) => {
      table.id();
      table.string('name');
      table.string('email').unique();
      table.timestamps();
    });

    await Schema.create('personal_access_tokens', (table) => {
      table.id();
      table.string('tokenable_type');
      table.integer('tokenable_id');
      table.string('name');
      table.string('token').unique();
      table.text('abilities');
      table.string('last_used_at').nullable();
      table.string('expires_at').nullable();
      table.timestamps();
    });
  });

  after(async () => {
    await Schema.dropIfExists('personal_access_tokens');
    await Schema.dropIfExists('users');
    await dbConnection.close();
  });

  test('PersonalAccessToken.createToken and ability checks', async () => {
    const user = await User.create({ name: 'Bob', email: 'bob@example.com' });

    // Create scoped token
    const { accessToken, plainTextToken } = await user.createToken('Mobile App', ['read', 'posts:create']);

    assert.ok(plainTextToken.startsWith('bir_pat_'));
    assert.strictEqual(accessToken.name, 'Mobile App');
    assert.strictEqual(accessToken.tokenable_id, user.id);
    assert.strictEqual(accessToken.can('read'), true);
    assert.strictEqual(accessToken.can('posts:create'), true);
    assert.strictEqual(accessToken.can('posts:delete'), false);
    assert.strictEqual(accessToken.cant('posts:delete'), true);

    // Create wildcard token
    const wildcard = await PersonalAccessToken.createToken(user, 'Full Access', ['*']);
    assert.strictEqual(wildcard.accessToken.can('anything'), true);
    assert.strictEqual(wildcard.accessToken.can('admin:destroy'), true);

    // List tokens for user via HasApiTokens
    const tokens = await user.tokens();
    assert.strictEqual(tokens.length, 2);
  });

  test('PersonalAccessToken.findToken verifies tokens and respects expiration', async () => {
    const user = await User.first();
    assert.ok(user);

    // Valid token
    const { plainTextToken } = await PersonalAccessToken.createToken(user, 'Valid Token');
    const found = await PersonalAccessToken.findToken(plainTextToken);
    assert.ok(found);
    assert.strictEqual(found.name, 'Valid Token');

    // Invalid token string
    assert.strictEqual(await PersonalAccessToken.findToken('invalid_token'), null);
    assert.strictEqual(await PersonalAccessToken.findToken('bir_pat_nonexistent'), null);

    // Expired token (1 hour ago)
    const pastDate = new Date(Date.now() - 3600 * 1000);
    const expired = await PersonalAccessToken.createToken(user, 'Expired Token', ['*'], pastDate);
    const foundExpired = await PersonalAccessToken.findToken(expired.plainTextToken);
    assert.strictEqual(foundExpired, null);
  });

  test('Auth resolves Bearer token and updates last_used_at', async () => {
    const user = await User.first();
    assert.ok(user);

    const { plainTextToken } = await PersonalAccessToken.createToken(user, 'API CLI');

    const mockCtx: Partial<Context> = {
      headers: {
        authorization: `Bearer ${plainTextToken}`,
      },
    };

    // User lookup via Auth.user
    const authedUser = await Auth.user<User>(mockCtx as Context, User);
    assert.ok(authedUser);
    assert.strictEqual(authedUser.id, user.id);
    assert.strictEqual(Auth.check(mockCtx as Context), true);
    assert.strictEqual(Auth.id(mockCtx as Context), user.id);

    const activeToken = Auth.token(mockCtx as Context);
    assert.ok(activeToken);
    assert.ok(activeToken.last_used_at !== null);
  });

  test('auth() and hasAbility() middlewares authenticate Bearer tokens', async () => {
    const user = await User.first();
    assert.ok(user);

    const { plainTextToken: scopedToken } = await PersonalAccessToken.createToken(user, 'Scoped', ['posts:view']);

    // 1. Unauthenticated request to JSON API -> 401
    let jsonOutput: any = null;
    let statusCode = 200;
    const unauthedCtx: Partial<Context> = {
      path: '/api/posts',
      headers: { accept: 'application/json' },
      json: (data: any, code = 200) => {
        jsonOutput = data;
        statusCode = code;
        return data;
      },
    };

    const authMw = auth();
    let nextCalled = false;
    await authMw(unauthedCtx as Context, async () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 401);
    assert.strictEqual(jsonOutput.error, 'Unauthorized');

    // 2. Authenticated request with Bearer token -> passes
    nextCalled = false;
    const authedCtx: Partial<Context> = {
      path: '/api/posts',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${scopedToken}`,
      },
    };
    await authMw(authedCtx as Context, async () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);

    // 3. Check hasAbility middleware
    const allowedMw = hasAbility('posts:view');
    let allowedCalled = false;
    await allowedMw(authedCtx as Context, async () => { allowedCalled = true; });
    assert.strictEqual(allowedCalled, true);

    // Forbidden ability
    jsonOutput = null;
    statusCode = 200;
    authedCtx.json = (data: any, code = 200) => {
      jsonOutput = data;
      statusCode = code;
      return data;
    };
    const deniedMw = hasAbility('posts:delete');
    let deniedCalled = false;
    await deniedMw(authedCtx as Context, async () => { deniedCalled = true; });
    assert.strictEqual(deniedCalled, false);
    assert.strictEqual(statusCode, 403);
    assert.strictEqual(jsonOutput.error, 'Forbidden');
  });
});
