import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { ResendMailDriver } from '../src/mail/drivers.js';
import { Mail, Mailable } from '../src/mail/index.js';

class WelcomeEmail extends Mailable {
  public content(): string {
    return '<h1>Welcome to BirJS</h1>';
  }
}

describe('ResendMailDriver', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Mail.restore();
  });

  test('ResendMailDriver sends JSON payload with base64 attachments via fetch', async () => {
    let capturedUrl = '';
    let capturedInit: any = null;

    globalThis.fetch = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
    }) as any;

    const driver = new ResendMailDriver('re_test_key_999');
    Mail.setDriver(driver);

    const mailable = new WelcomeEmail()
      .from('billing@birjs.com', 'BirBilling')
      .subject('Invoice Ready')
      .attach({ filename: 'inv.pdf', content: Buffer.from('PDFDATA') });

    const ok = await Mail.to('user@example.com').send(mailable);
    assert.strictEqual(ok, true);
    assert.strictEqual(capturedUrl, 'https://api.resend.com/emails');
    assert.strictEqual(capturedInit.headers.Authorization, 'Bearer re_test_key_999');

    const body = JSON.parse(capturedInit.body);
    assert.strictEqual(body.from, 'BirBilling <billing@birjs.com>');
    assert.deepStrictEqual(body.to, ['user@example.com']);
    assert.strictEqual(body.attachments[0].filename, 'inv.pdf');
    assert.strictEqual(body.attachments[0].content, Buffer.from('PDFDATA').toString('base64'));
  });
});
