import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { JsonResource, ResourceCollection } from '../src/http/resources/index.js';
import { LengthAwarePaginator } from '../src/pagination/index.js';

interface TestUser {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role?: string;
  profile?: { bio: string } | null;
}

class UserResource extends JsonResource<TestUser> {
  public override toArray() {
    return {
      id: this.resource.id,
      name: this.resource.name,
      email: this.resource.email,
      role: this.when(Boolean(this.resource.role), this.resource.role),
      bio: this.whenNotNull(this.resource.profile?.bio),
    };
  }
}

describe('BirFramework JsonResource API Transformation Tests', () => {
  const user: TestUser = {
    id: 1,
    name: 'Ferdi Sahin',
    email: 'ferdi@birframework.dev',
    passwordHash: 'secret_hash_not_exposed',
    role: 'admin',
    profile: { bio: 'Framework Architect' },
  };

  afterEach(() => {
    // Reset wrapping to default
    JsonResource.wrapKey = 'data';
  });

  test('UserResource.make should transform single resource and wrap under data by default', () => {
    const resource = UserResource.make(user);
    const output = resource.resolve();

    assert.ok(output.data);
    assert.strictEqual(output.data.id, 1);
    assert.strictEqual(output.data.name, 'Ferdi Sahin');
    assert.strictEqual(output.data.email, 'ferdi@birframework.dev');
    assert.strictEqual(output.data.passwordHash, undefined); // sensitive field omitted!
    assert.strictEqual(output.data.role, 'admin');
    assert.strictEqual(output.data.bio, 'Framework Architect');
  });

  test('withoutWrapping should allow flat JSON output', () => {
    JsonResource.withoutWrapping();
    const resource = UserResource.make(user);
    const output = resource.resolve();

    assert.strictEqual(output.id, 1);
    assert.strictEqual(output.name, 'Ferdi Sahin');
    assert.strictEqual(output.data, undefined);
  });

  test('conditional attributes with when and whenNotNull should respect falsy values', () => {
    const guestUser: TestUser = {
      id: 2,
      name: 'Guest',
      email: 'guest@example.com',
      passwordHash: 'hash',
      role: undefined,
      profile: null,
    };

    const output = UserResource.make(guestUser).resolve();
    assert.strictEqual(output.data.role, undefined);
    assert.strictEqual(output.data.bio, undefined);
  });

  test('additional() should attach extra metadata at root level', () => {
    const output = UserResource.make(user)
      .additional({ apiVersion: 'v1', serverTime: 123456789 })
      .resolve();

    assert.ok(output.data);
    assert.strictEqual(output.apiVersion, 'v1');
    assert.strictEqual(output.serverTime, 123456789);
  });

  test('UserResource.collection should transform array of resources', () => {
    const users: TestUser[] = [
      user,
      { id: 2, name: 'Alice', email: 'alice@example.com', passwordHash: 'hash' },
    ];

    const collection = UserResource.collection(users).resolve();
    assert.ok(Array.isArray(collection.data));
    assert.strictEqual(collection.data.length, 2);
    assert.strictEqual(collection.data[0].name, 'Ferdi Sahin');
    assert.strictEqual(collection.data[1].name, 'Alice');
  });

  test('UserResource.collection with LengthAwarePaginator should preserve pagination meta and links', () => {
    const users: TestUser[] = [
      user,
      { id: 2, name: 'Alice', email: 'alice@example.com', passwordHash: 'hash' },
    ];

    const paginator = new LengthAwarePaginator(users, 50, 15, 1, '/api/users');
    const collection = UserResource.collection(paginator).resolve();

    assert.ok(Array.isArray(collection.data));
    assert.strictEqual(collection.data.length, 2);
    assert.ok(collection.meta);
    assert.strictEqual(collection.meta.total, 50);
    assert.strictEqual(collection.meta.currentPage, 1);
    assert.strictEqual(collection.meta.perPage, 15);
    assert.ok(collection.links);
    assert.strictEqual(collection.links.first, '/api/users?page=1');
  });
});
