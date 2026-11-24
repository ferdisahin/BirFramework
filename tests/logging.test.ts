import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Log } from '../src/logging/log.js';

describe('BirFramework Logging & Log Stream Tests', () => {
  const testLogPath = resolve(process.cwd(), 'test-bir.log');

  afterEach(() => {
    Log.logFile = null;
    if (existsSync(testLogPath)) {
      rmSync(testLogPath, { force: true });
    }
  });

  test('Log.info, Log.warning, Log.error should write structured log entries', () => {
    Log.logFile = testLogPath;

    Log.info('Test info message', { userId: 42 });
    Log.warning('Test warning message');
    Log.error('Test error message', { code: 'ERR_FAIL' });

    assert.strictEqual(existsSync(testLogPath), true);
    const content = readFileSync(testLogPath, 'utf-8');

    assert.match(content, /bir\.INFO: Test info message \{"userId":42\}/);
    assert.match(content, /bir\.WARNING: Test warning message/);
    assert.match(content, /bir\.ERROR: Test error message \{"code":"ERR_FAIL"\}/);
  });
});
