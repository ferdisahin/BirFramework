import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { createHmac } from 'node:crypto';
import { Crypt, CryptError } from '../src/security/crypt.js';
import { Gate, can } from '../src/auth/gate.js';
import { Application } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('Phase 1: Crypt, RawBody & Gate Authorization Tests', () => {
  afterEach(() => {
    Gate.clear();
  });

  test('Crypt.encrypt and Crypt.decrypt round-trip strings and objects with AES-256-GCM', () => {
    const key = 'base64:' + Buffer.alloc(32, 7).toString('base64');

    const secretToken = Crypt.encrypt('whm_api_secret_9911', key);
    assert.notStrictEqual(secretToken, 'whm_api_secret_9911');
    assert.strictEqual(Crypt.decrypt(secretToken, key), 'whm_api_secret_9911');

    const objPayload = { host: 'srv1.example.com', port: 2087, ssl: true };
    const encryptedObj = Crypt.encrypt(objPayload, key);
    assert.deepStrictEqual(Crypt.decrypt(encryptedObj, key), objPayload);
  });

  test('Crypt.decrypt throws CryptError on tampered payload or wrong key', () => {
    const key1 = 'super-secret-key-one-123456789012';
    const key2 = 'super-secret-key-two-123456789012';

    const token = Crypt.encrypt('sensitive-data', key1);
    assert.throws(() => Crypt.decrypt(token, key2), CryptError);

    const tampered = token.slice(0, -3) + 'AAA';
    assert.throws(() => Crypt.decrypt(tampered, key1), CryptError);
  });

  test('Context.rawBody and rawBodyText expose exact unparsed payload for webhook HMAC', async () => {
    const app = new Application();
    const webhookSecret = 'whsec_test_123';

    app.router.post('/webhooks/stripe', async (ctx) => {
      const rawText = await ctx.rawBodyText();
      const buf = await ctx.rawBody();
      const sig = createHmac('sha256', webhookSecret).update(buf).digest('hex');
      return ctx.json({ rawText, sig });
    });

    const client = createTestClient(app);
    const payload = '{"event":"invoice.paid","amount":1999}';
    const expectedSig = createHmac('sha256', webhookSecret).update(payload).digest('hex');

    const res = await client.post('/webhooks/stripe', payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    res.assertOk();
    const json = res.json();
    assert.strictEqual(json.rawText, payload);
    assert.strictEqual(json.sig, expectedSig);

    await client.close();
  });

  test('Gate.define, before, allows, denies, authorize and can() middleware work as expected', async () => {
    Gate.before((user) => {
      if (user?.role === 'superadmin') return true;
      return null;
    });

    Gate.define('cancel-invoice', (user, invoice) => {
      return Boolean(user && invoice && user.id === invoice.userId);
    });

    const owner = { id: 10, role: 'user' };
    const other = { id: 20, role: 'user' };
    const superAdmin = { id: 1, role: 'superadmin' };
    const invoice = { id: 500, userId: 10 };

    assert.strictEqual(await Gate.allows('cancel-invoice', owner, invoice), true);
    assert.strictEqual(await Gate.denies('cancel-invoice', other, invoice), true);
    assert.strictEqual(await Gate.allows('cancel-invoice', superAdmin, invoice), true);

    await assert.rejects(
      () => Gate.authorize('cancel-invoice', other, invoice),
      (err: any) => err.name === 'AuthorizationError'
    );

    const app = new Application();
    app.router.get('/admin-only', (ctx) => ctx.json({ ok: true })).middleware(can('manage-billing'));

    const client = createTestClient(app);
    const res = await client.get('/admin-only', { headers: { Accept: 'application/json' } });
    res.assertStatus(403);
    await client.close();
  });
});
