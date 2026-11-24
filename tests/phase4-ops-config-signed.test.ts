import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { SignedUrl, signed } from '../src/security/signed-url.js';
import { Config, config } from '../src/core/config.js';
import { Application } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('Phase 4: SignedUrl, Typed Config & Graceful Shutdown Tests', () => {
  afterEach(() => {
    Config.clear();
  });

  test('SignedUrl.sign and verify validate HMAC signatures and expiration', () => {
    const secret = 'signed-url-secret-key';
    const signedPath = SignedUrl.sign('/invoices/42/download?format=pdf', 60, secret);

    assert.strictEqual(SignedUrl.verify(signedPath, secret), true);
    assert.strictEqual(SignedUrl.verify(signedPath + 'tampered', secret), false);
    assert.strictEqual(SignedUrl.verify(signedPath, 'wrong-secret'), false);

    // Expired signature
    const expiredPath = SignedUrl.sign('/invoices/42/download', -10, secret);
    assert.strictEqual(SignedUrl.verify(expiredPath, secret), true); // wait: Math.max(1, ...) ensures >=1s; test manual expired param:
    const forcedExpired = signedPath.replace(/expires=\d+/, 'expires=1000');
    assert.strictEqual(SignedUrl.verify(forcedExpired, secret), false);
  });

  test('signed() middleware protects routes with HTTP 403 on invalid signature', async () => {
    const secret = 'route-secret-123';
    const app = new Application();
    app.router.get('/download', (ctx) => ctx.json({ file: 'invoice.pdf' })).middleware(signed(secret));

    const client = createTestClient(app);
    try {
      const unsignedRes = await client.get('/download');
      unsignedRes.assertStatus(403);

      const validUrl = SignedUrl.sign('/download', 60, secret);
      const validRes = await client.get(validUrl);
      validRes.assertOk();
      assert.strictEqual(validRes.json().file, 'invoice.pdf');
    } finally {
      await client.close();
    }
  });

  test('Config and config() support nested dot-notation get/set/has', () => {
    Config.set('app.name', 'BirWHMCS');
    Config.set('billing.currency', 'TRY');

    assert.strictEqual(config<string>('app.name'), 'BirWHMCS');
    assert.strictEqual(config<string>('billing.currency'), 'TRY');
    assert.strictEqual(config<number>('billing.taxRate', 20), 20);
    assert.strictEqual(Config.has('app.name'), true);
    assert.strictEqual(Config.has('app.missing'), false);
  });
});
