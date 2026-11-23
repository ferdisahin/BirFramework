import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { Http, HttpRequestException } from '../src/index.js';

describe('BirFramework Fluent HTTP Client Tests', () => {
  let localServer: http.Server;
  let localPort: number;
  let localUrl: string;

  before(async () => {
    localServer = http.createServer((req, res) => {
      if (req.url === '/echo') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            method: req.method,
            headers: req.headers,
            body: body ? JSON.parse(body) : null,
          }));
        });
      } else if (req.url?.startsWith('/query')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ url: req.url }));
      } else if (req.url === '/error-500') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Internal Error');
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    });

    await new Promise<void>((resolve) => {
      localServer.listen(0, () => {
        const addr = localServer.address();
        if (typeof addr === 'object' && addr) {
          localPort = addr.port;
          localUrl = `http://localhost:${localPort}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => localServer.close(() => resolve()));
  });

  beforeEach(() => {
    Http.resetFakes();
  });

  test('Http.fake() stubs URLs with wildcard matching and captures requests', async () => {
    Http.fake({
      'https://api.github.com/users/*': Http.response({ id: 42, login: 'birframework' }, 200),
      'https://api.stripe.com/*': Http.response({ paid: true }, 200),
      '*': Http.response({ error: 'not found' }, 404),
    });

    const ghRes = await Http.withToken('ghp_test123').get('https://api.github.com/users/bir');
    assert.strictEqual(ghRes.ok, true);
    assert.strictEqual(ghRes.json('login'), 'birframework');

    const stripeRes = await Http.post('https://api.stripe.com/charges', { amount: 5000 });
    assert.strictEqual(stripeRes.status, 200);
    assert.strictEqual(stripeRes.json('paid'), true);

    const unknownRes = await Http.get('https://unknown.com/page');
    assert.strictEqual(unknownRes.status, 404);
    assert.strictEqual(unknownRes.json('error'), 'not found');

    // Assertions
    Http.assertSentCount(3);
    Http.assertSent((req) => req.url.includes('api.github.com') && req.hasHeader('authorization', 'Bearer ghp_test123'));
    Http.assertSent((req) => req.url.includes('stripe.com') && req.method === 'POST');
    Http.assertNotSent((req) => req.url.includes('malicious-site.com'));
  });

  test('HttpResponse methods, nested json parsing, and throw on failure', async () => {
    Http.fake({
      'https://example.com/user': Http.response({
        user: {
          profile: {
            name: 'Ferdi',
            skills: ['TypeScript', 'Go'],
          },
        },
      }, 200),
      'https://example.com/fail': Http.response({ message: 'Forbidden' }, 403),
    });

    const res = await Http.get('https://example.com/user');
    assert.strictEqual(res.successful(), true);
    assert.strictEqual(res.json('user.profile.name'), 'Ferdi');
    assert.strictEqual(res.json('user.profile.unknown', 'default_val'), 'default_val');

    const failRes = await Http.get('https://example.com/fail');
    assert.strictEqual(failRes.failed(), true);
    assert.strictEqual(failRes.clientError(), true);
    assert.throws(() => failRes.throw(), HttpRequestException);
  });

  test('Real HTTP execution with baseUrl, headers, and query parameters', async () => {
    // No fake enabled: communicates with local test server
    const client = Http.baseUrl(localUrl)
      .withHeaders({ 'X-Client': 'BirFramework-Test' })
      .withBasicAuth('user1', 'secretPass');

    const postRes = await client.post('/echo', { message: 'hello world' });
    assert.strictEqual(postRes.status, 200);
    const data = postRes.json();
    assert.strictEqual(data.method, 'POST');
    assert.strictEqual(data.headers['x-client'], 'BirFramework-Test');
    assert.ok(data.headers['authorization'].startsWith('Basic '));
    assert.strictEqual(data.body.message, 'hello world');

    // Query parameters
    const queryRes = await Http.get(`${localUrl}/query`, { page: 2, sort: 'desc' });
    assert.strictEqual(queryRes.ok, true);
    assert.ok(queryRes.json('url').includes('page=2&sort=desc'));
  });
});
