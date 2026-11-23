import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { Schema, Model, dbConnection } from '../src/index.js';

class Author extends Model {
  public static override table = 'el_authors';

  public articles() {
    return this.hasMany(Article, 'author_id');
  }

  public profile() {
    return this.hasOne(Profile, 'author_id');
  }
}

class Article extends Model {
  public static override table = 'el_articles';

  public author() {
    return this.belongsTo(Author, 'author_id');
  }

  public comments() {
    return this.hasMany(Comment, 'article_id');
  }
}

class Profile extends Model {
  public static override table = 'el_profiles';

  public author() {
    return this.belongsTo(Author, 'author_id');
  }
}

class Comment extends Model {
  public static override table = 'el_comments';

  public article() {
    return this.belongsTo(Article, 'article_id');
  }
}

describe('BirFramework Eager Loading (with) Tests', () => {
  before(async () => {
    process.env.DB_DATABASE = ':memory:';
    dbConnection.connect();

    await Schema.create('el_authors', (table) => {
      table.id();
      table.string('name');
      table.timestamps();
    });

    await Schema.create('el_articles', (table) => {
      table.id();
      table.integer('author_id');
      table.string('title');
      table.timestamps();
    });

    await Schema.create('el_profiles', (table) => {
      table.id();
      table.integer('author_id');
      table.string('bio');
      table.timestamps();
    });

    await Schema.create('el_comments', (table) => {
      table.id();
      table.integer('article_id');
      table.string('body');
      table.timestamps();
    });

    // Seed test data
    const author1 = await Author.create({ name: 'Taylor Otwell' });
    const author2 = await Author.create({ name: 'Evan You' });
    const author3 = await Author.create({ name: 'Empty Author' });

    await Profile.create({ author_id: author1.id, bio: 'Creator of Laravel' });
    await Profile.create({ author_id: author2.id, bio: 'Creator of Vue' });

    const article1 = await Article.create({ author_id: author1.id, title: 'Eloquent Deep Dive' });
    const article2 = await Article.create({ author_id: author1.id, title: 'Architecture Patterns' });
    const article3 = await Article.create({ author_id: author2.id, title: 'Reactivity Explained' });

    await Comment.create({ article_id: article1.id, body: 'Great article!' });
    await Comment.create({ article_id: article1.id, body: 'Very helpful' });
    await Comment.create({ article_id: article3.id, body: 'Vue 3 rocks' });
  });

  after(async () => {
    await Schema.dropIfExists('el_comments');
    await Schema.dropIfExists('el_articles');
    await Schema.dropIfExists('el_profiles');
    await Schema.dropIfExists('el_authors');
    await dbConnection.close();
  });

  test('Author.with("articles").get() eagerly loads hasMany relationships in single query', async () => {
    const authors = await Author.with('articles').orderBy('id', 'asc').get();

    assert.strictEqual(authors.length, 3);

    // Author 1 has 2 articles
    const a1 = authors[0]!;
    assert.strictEqual(a1.name, 'Taylor Otwell');
    assert.strictEqual(a1.articles.length, 2);
    assert.strictEqual(a1.articles[0]!.title, 'Eloquent Deep Dive');
    assert.strictEqual(a1.articles[1]!.title, 'Architecture Patterns');

    // Author 2 has 1 article
    const a2 = authors[1]!;
    assert.strictEqual(a2.name, 'Evan You');
    assert.strictEqual(a2.articles.length, 1);
    assert.strictEqual(a2.articles[0]!.title, 'Reactivity Explained');

    // Author 3 has 0 articles
    const a3 = authors[2]!;
    assert.strictEqual(a3.name, 'Empty Author');
    assert.deepStrictEqual(a3.articles, []);
  });

  test('Lazy loading relations works when with() is not called', async () => {
    const author = await Author.find(1);
    assert.ok(author);
    // When with() is not called, author.articles() is the relationship method
    const rel = author!.articles();
    assert.strictEqual(rel.type, 'hasMany');
    const articles = await rel.get();
    assert.strictEqual(articles.length, 2);
  });

  test('Article.with("author").get() eagerly loads belongsTo relationships', async () => {
    const articles = await Article.with('author').orderBy('id', 'asc').get();

    assert.strictEqual(articles.length, 3);

    const art1 = articles[0]!;
    assert.strictEqual(art1.title, 'Eloquent Deep Dive');
    assert.ok(art1.author);
    assert.strictEqual(art1.author.name, 'Taylor Otwell');

    const art3 = articles[2]!;
    assert.strictEqual(art3.title, 'Reactivity Explained');
    assert.ok(art3.author);
    assert.strictEqual(art3.author.name, 'Evan You');
  });

  test('Author.with("profile").first() eagerly loads hasOne relationship', async () => {
    const author = await Author.with('profile').where('id', '=', 1).first();

    assert.ok(author);
    assert.strictEqual(author!.name, 'Taylor Otwell');
    assert.ok(author!.profile);
    assert.strictEqual(author!.profile.bio, 'Creator of Laravel');
  });

  test('Article.with("author", "comments").find(id) eagerly loads multiple relationships', async () => {
    const article = await Article.with('author', 'comments').find(1);

    assert.ok(article);
    assert.strictEqual(article!.title, 'Eloquent Deep Dive');
    assert.ok(article!.author);
    assert.strictEqual(article!.author.name, 'Taylor Otwell');
    assert.strictEqual(article!.comments.length, 2);
    assert.strictEqual(article!.comments[0]!.body, 'Great article!');
    assert.strictEqual(article!.comments[1]!.body, 'Very helpful');
  });

  test('toJSON() serializes eager-loaded relationships into JSON output', async () => {
    const author = await Author.with('articles', 'profile').find(1);
    assert.ok(author);

    const json = author!.toJSON();
    assert.strictEqual(json['name'], 'Taylor Otwell');
    assert.ok(Array.isArray(json['articles']));
    assert.strictEqual(json['articles'].length, 2);
    assert.strictEqual(json['articles'][0]['title'], 'Eloquent Deep Dive');
    assert.ok(json['profile']);
    assert.strictEqual(json['profile']['bio'], 'Creator of Laravel');

    const serialized = JSON.stringify(author);
    assert.ok(serialized.includes('Eloquent Deep Dive'));
    assert.ok(serialized.includes('Creator of Laravel'));
  });

  test('Query with unknown relation throws informative error', async () => {
    await assert.rejects(async () => {
      await Author.with('nonExistentRelation').get();
    }, /Relation "nonExistentRelation" is not defined on model Author/);
  });
});
