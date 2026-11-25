import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { Model, Schema, type Blueprint } from '../src/index.js';

class Article extends Model {
  static override table = 'articles';
  static override softDeletes = true;

  public beforeCreateCalled = false;
  public afterCreateCalled = false;

  public beforeCreate() {
    this.beforeCreateCalled = true;
    if (!this.attributes['slug']) {
      this.attributes['slug'] = String(this.attributes['title']).toLowerCase().replace(/\s+/g, '-');
    }
  }

  public afterCreate() {
    this.afterCreateCalled = true;
  }
}

describe('BirFramework Model Lifecycle Hooks & Soft Deletes', () => {
  before(async () => {
    process.env.DB_CONNECTION = 'sqlite';
    process.env.DB_DATABASE = ':memory:';
    await Schema.create('articles', (table: Blueprint) => {
      table.id();
      table.string('title');
      table.string('slug').nullable();
      table.string('deleted_at').nullable();
      table.timestamps();
    });
  });

  after(async () => {
    await Schema.dropIfExists('articles');
  });

  test('Model lifecycle hooks on instance and static callbacks', async () => {
    let staticSavedCalled = false;
    Article.saved((model) => {
      staticSavedCalled = true;
    });

    const article = await Article.create({ title: 'My First Post' });

    assert.strictEqual(article.beforeCreateCalled, true);
    assert.strictEqual(article.afterCreateCalled, true);
    assert.strictEqual(article.slug, 'my-first-post');
    assert.strictEqual(staticSavedCalled, true);
  });

  test('Soft delete hides record from normal query but retains in withTrashed', async () => {
    const post = await Article.create({ title: 'Soft Delete Post' });
    const id = post.id;

    assert.strictEqual(post.trashed(), false);

    // Delete post (should soft delete)
    const deleted = await post.delete();
    assert.strictEqual(deleted, true);
    assert.strictEqual(post.trashed(), true);
    assert.ok(post.attributes['deleted_at']);

    // Regular find should return null
    const foundNormal = await Article.find(id);
    assert.strictEqual(foundNormal, null);

    // withTrashed should find the record
    const foundTrashed = await Article.withTrashed().where('id', '=', id).first();
    assert.ok(foundTrashed);
    assert.strictEqual(foundTrashed.id, id);

    // onlyTrashed should find it
    const onlyTrashedList = await Article.onlyTrashed().get();
    assert.ok(onlyTrashedList.some((r: any) => r.id === id));

    // Restore record
    await post.restore();
    assert.strictEqual(post.trashed(), false);
    const foundRestored = await Article.find(id);
    assert.ok(foundRestored);

    // Force delete (hard delete)
    await post.forceDelete();
    const foundAfterForce = await Article.withTrashed().where('id', '=', id).first();
    assert.strictEqual(foundAfterForce, null);
  });
});
