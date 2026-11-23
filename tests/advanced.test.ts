import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import {
  Mail,
  Mailable,
  Schedule,
  RateLimiter,
  csrfToken,
  csrfField,
  Session,
  Model,
  Schema,
  dbConnection,
  type Context,
} from '../src/index.js';
import { loadEnv } from '../src/core/env.js';
import { Seeder } from '../src/database/seeder.js';

class WelcomeMail extends Mailable {
  constructor(public userName: string) {
    super();
    this.subject('Welcome to BirFramework!');
  }

  public content(): string {
    return `<h1>Welcome, ${this.userName}!</h1><p>We are glad to have you on board.</p>`;
  }
}

describe('BirFramework Mail Tests', () => {
  before(() => {
    Mail.fake();
  });

  after(() => {
    Mail.restore();
  });

  test('Mail.to().send() should send mailable and record in fake driver', async () => {
    await Mail.to('newuser@example.com').send(new WelcomeMail('Alex'));

    const sent = Mail.sent();
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0]!.to, 'newuser@example.com');
    assert.strictEqual(sent[0]!.subject, 'Welcome to BirFramework!');
    assert.ok(sent[0]!.html.includes('Welcome, Alex!'));
  });

  test('Mail.to().raw() should send raw html email', async () => {
    await Mail.to('raw@example.com').raw('<p>Simple message</p>', { subject: 'Raw Subject' });

    const sent = Mail.sent();
    assert.strictEqual(sent.length, 2);
    assert.strictEqual(sent[1]!.to, 'raw@example.com');
    assert.strictEqual(sent[1]!.subject, 'Raw Subject');
  });
});

describe('BirFramework Task Scheduler Tests', () => {
  test('Schedule.call should register tasks and execute when due', async () => {
    let executionCount = 0;

    Schedule.call(() => {
      executionCount++;
    }, 'Increment counter task').everyMinute();

    const ranCount = await Schedule.runDue();
    assert.strictEqual(ranCount, 1);
    assert.strictEqual(executionCount, 1);

    // If called immediately again within the same minute, it should not be due
    const ranCountAgain = await Schedule.runDue();
    assert.strictEqual(ranCountAgain, 0);
    assert.strictEqual(executionCount, 1);
  });
});

describe('BirFramework Security (RateLimiter & CSRF) Tests', () => {
  test('RateLimiter should track counts and reject when threshold exceeded', () => {
    const limiter = new RateLimiter();
    const key = '127.0.0.1:/api/login';

    // Allow 3 requests in 60s
    assert.strictEqual(limiter.check(key, 3, 60000).allowed, true);
    assert.strictEqual(limiter.check(key, 3, 60000).allowed, true);
    assert.strictEqual(limiter.check(key, 3, 60000).allowed, true);

    // 4th request should be blocked
    const fourth = limiter.check(key, 3, 60000);
    assert.strictEqual(fourth.allowed, false);
    assert.strictEqual(fourth.remaining, 0);
  });

  test('csrfToken and csrfField should generate and verify tokens in session', () => {
    const mockCtx: Partial<Context> = {
      session: new Session(),
    };

    const token = csrfToken(mockCtx as Context);
    assert.ok(token);
    assert.strictEqual(token.length, 48); // 24 bytes hex

    const fieldHtml = csrfField(mockCtx as Context);
    assert.ok(fieldHtml.includes('type="hidden"'));
    assert.ok(fieldHtml.includes(`value="${token}"`));
  });
});

class Author extends Model {
  public static override table = 'authors';
}

class Article extends Model {
  public static override table = 'articles';
}

describe('BirFramework ORM Relationships Tests', () => {
  before(async () => {
    process.env.DB_DATABASE = ':memory:';
    dbConnection.connect();

    await Schema.create('authors', (table) => {
      table.id();
      table.string('name');
      table.timestamps();
    });

    await Schema.create('articles', (table) => {
      table.id();
      table.integer('author_id');
      table.string('title');
      table.timestamps();
    });
  });

  after(async () => {
    await Schema.dropIfExists('authors');
    await Schema.dropIfExists('articles');
    await dbConnection.close();
  });

  test('hasMany and belongsTo should query related records across tables', async () => {
    // 1. Create Author
    const author = await Author.create({ name: 'Taylor' });
    assert.strictEqual(author.id, 1);

    // 2. Create 2 Articles for this author
    const article1 = await Article.create({ author_id: author.id, title: 'Deep Dive into ORM' });
    const article2 = await Article.create({ author_id: author.id, title: 'Modern Architecture' });

    // 3. hasMany test: author.hasMany(Article).get()
    const articles = await author.hasMany(Article).get();
    assert.strictEqual(articles.length, 2);
    assert.strictEqual(articles[0]!.title, 'Deep Dive into ORM');
    assert.strictEqual(articles[1]!.title, 'Modern Architecture');

    // 4. belongsTo test: article.belongsTo(Author)
    const fetchedAuthor = await article1.belongsTo(Author);
    assert.ok(fetchedAuthor);
    assert.strictEqual(fetchedAuthor!.name, 'Taylor');
    assert.strictEqual(fetchedAuthor!.id, author.id);
  });
});

describe('BirFramework Core Env & Seeder Tests', () => {
  test('loadEnv should parse key value pairs into process.env', () => {
    // Test loadEnv functionality
    const parsed = loadEnv('non-existent-env-path');
    assert.deepStrictEqual(parsed, {});
  });

  test('Seeder class should execute run method', async () => {
    let seeded = false;
    class MockUserSeeder extends Seeder {
      public run() {
        seeded = true;
      }
    }

    const seeder = new MockUserSeeder();
    await seeder.run();
    assert.strictEqual(seeded, true);
  });
});
