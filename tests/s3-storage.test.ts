import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Storage, S3Disk } from '../src/index.js';

describe('BirFramework S3 & Cloudflare R2 Storage Driver Tests', () => {
  beforeEach(() => {
    delete process.env.AWS_BUCKET;
    delete process.env.S3_BUCKET;
  });

  test('S3Disk should construct AWS standard and custom CDN URLs', () => {
    // 1. AWS Standard S3
    const awsDisk = new S3Disk({
      bucket: 'my-production-bucket',
      region: 'eu-west-1',
    });
    assert.strictEqual(
      awsDisk.url('uploads/doc.pdf'),
      'https://my-production-bucket.s3.eu-west-1.amazonaws.com/uploads/doc.pdf'
    );
    assert.strictEqual(
      awsDisk.path('uploads/doc.pdf'),
      's3://my-production-bucket/uploads/doc.pdf'
    );

    // 2. Cloudflare R2 with custom endpoint
    const r2Disk = new S3Disk({
      bucket: 'assets',
      endpoint: 'https://xyz123.r2.cloudflarestorage.com',
    });
    assert.strictEqual(
      r2Disk.url('images/logo.png'),
      'https://xyz123.r2.cloudflarestorage.com/assets/images/logo.png'
    );

    // 3. Custom CDN domain
    const cdnDisk = new S3Disk({
      bucket: 'assets',
      url: 'https://cdn.example.com',
    });
    assert.strictEqual(
      cdnDisk.url('css/app.css'),
      'https://cdn.example.com/css/app.css'
    );
  });

  test('S3Disk should perform put, get, exists, size and delete operations', async () => {
    const disk = new S3Disk({
      bucket: 'test-bucket',
      region: 'us-east-1',
    });

    // Initial state
    assert.strictEqual(await disk.exists('hello.txt'), false);
    assert.strictEqual(await disk.get('hello.txt'), null);

    // Put file
    const putOk = await disk.put('hello.txt', 'Hello S3 Cloud Storage!');
    assert.strictEqual(putOk, true);

    // Exists & Size
    assert.strictEqual(await disk.exists('hello.txt'), true);
    assert.strictEqual(await disk.size('hello.txt'), 23);

    // Get text and buffer
    const content = await disk.get('hello.txt');
    assert.strictEqual(content, 'Hello S3 Cloud Storage!');

    const buffer = await disk.getBuffer('hello.txt');
    assert.ok(Buffer.isBuffer(buffer));
    assert.strictEqual(buffer.toString('utf-8'), 'Hello S3 Cloud Storage!');

    // Delete
    const deleted = await disk.delete('hello.txt');
    assert.strictEqual(deleted, true);
    assert.strictEqual(await disk.exists('hello.txt'), false);
    assert.strictEqual(await disk.get('hello.txt'), null);
  });

  test('S3Disk temporaryUrl should generate SigV4 pre-signed URL with query parameters', () => {
    const disk = new S3Disk({
      bucket: 'secure-vault',
      region: 'eu-central-1',
      key: 'AKIAIOSFODNN7EXAMPLE',
      secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });

    const signedUrl = disk.temporaryUrl('invoices/inv_2026.pdf', 3600);
    assert.ok(signedUrl.startsWith('https://secure-vault.s3.eu-central-1.amazonaws.com/invoices/inv_2026.pdf?'));
    assert.ok(signedUrl.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'));
    assert.ok(signedUrl.includes('X-Amz-Credential=AKIAIOSFODNN7EXAMPLE'));
    assert.ok(signedUrl.includes('X-Amz-Expires=3600'));
    assert.ok(signedUrl.includes('X-Amz-Signature='));
  });

  test('Storage.disk("s3") auto-configures from environment and can be registered dynamically', async () => {
    process.env.AWS_BUCKET = 'env-configured-bucket';
    process.env.AWS_DEFAULT_REGION = 'ap-southeast-1';

    const s3 = Storage.disk('s3');
    assert.ok(s3 instanceof S3Disk);
    assert.strictEqual((s3 as S3Disk).bucket, 'env-configured-bucket');
    assert.strictEqual((s3 as S3Disk).region, 'ap-southeast-1');

    await s3.put('test.json', JSON.stringify({ framework: 'Bir' }));
    assert.strictEqual(await s3.exists('test.json'), true);
    assert.strictEqual(await s3.get('test.json'), '{"framework":"Bir"}');
  });

  test('S3Disk custom mockHandler hook', async () => {
    const mockActions: string[] = [];
    const disk = new S3Disk({
      bucket: 'mock-bucket',
      mockHandler: (action, path) => {
        mockActions.push(`${action}:${path}`);
        if (action === 'get') return 'mocked-data';
        return true;
      },
    });

    await disk.put('mock.txt', 'test');
    const val = await disk.get('mock.txt');
    await disk.delete('mock.txt');

    assert.strictEqual(val, 'mocked-data');
    assert.deepStrictEqual(mockActions, ['put:mock.txt', 'get:mock.txt', 'delete:mock.txt']);
  });
});
