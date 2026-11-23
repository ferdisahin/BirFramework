import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { Application, Storage } from '../src/index.js';
import http from 'node:http';

describe('BirFramework Multipart & File Upload Tests', () => {
  let server: http.Server;
  const port = 4991;

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await Storage.disk('local').delete('avatars/test-custom.txt');
  });

  test('Multipart form data parsing and single file upload', async () => {
    const app = new Application();

    app.router.post('/upload', async (ctx) => {
      const body = await ctx.body();
      const file = await ctx.file('avatar');

      assert.strictEqual(body.username, 'ferdi');
      assert.ok(file, 'File should exist');
      assert.strictEqual(file.originalName, 'hello.txt');
      assert.strictEqual(file.mimeType, 'text/plain');
      assert.strictEqual(file.extension(), 'txt');
      assert.strictEqual(file.toString(), 'Hello BirFramework Uploads!');

      // Test store()
      const storedPath = await file.store('avatars');
      assert.ok(storedPath.startsWith('avatars/'));
      assert.ok(storedPath.endsWith('.txt'));

      const exists = await Storage.disk('local').exists(storedPath);
      assert.strictEqual(exists, true);

      // Test storeAs()
      const customPath = await file.storeAs('avatars', 'test-custom.txt');
      assert.strictEqual(customPath, 'avatars/test-custom.txt');
      const customExists = await Storage.disk('local').exists(customPath);
      assert.strictEqual(customExists, true);

      // Clean up stored file
      await Storage.disk('local').delete(storedPath);

      return ctx.json({ success: true, path: storedPath });
    });

    server = http.createServer((req, res) => app.handle(req, res));
    await new Promise<void>((resolve) => server.listen(port, () => resolve()));

    const boundary = '---------------------------974767299852498929531610575';
    const crlf = '\r\n';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}${crlf}`),
      Buffer.from(`Content-Disposition: form-data; name="username"${crlf}${crlf}`),
      Buffer.from(`ferdi${crlf}`),
      Buffer.from(`--${boundary}${crlf}`),
      Buffer.from(`Content-Disposition: form-data; name="avatar"; filename="hello.txt"${crlf}`),
      Buffer.from(`Content-Type: text/plain${crlf}${crlf}`),
      Buffer.from(`Hello BirFramework Uploads!${crlf}`),
      Buffer.from(`--${boundary}--${crlf}`),
    ]);

    const res = await fetch(`http://localhost:${port}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: payload,
    });

    const data: any = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
  });
});
