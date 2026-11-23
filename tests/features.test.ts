import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import {
  Validator,
  ValidationError,
  Storage,
  Job,
  dispatch,
  worker,
  Queue,
  dbConnection,
} from '../src/index.js';

describe('BirFramework Validation Tests', () => {
  test('Validator should pass valid data and sanitize', async () => {
    const input = {
      name: 'John Doe',
      email: 'john@example.com',
      age: '25',
      password: 'password123',
      password_confirmation: 'password123',
      role: 'admin',
    };

    const validated = await Validator.validate(input, {
      name: 'required|min:3|max:50',
      email: 'required|email',
      age: 'required|numeric',
      password: 'required|min:6|confirmed',
      role: 'required|in:admin,editor,user',
    });

    assert.strictEqual(validated.name, 'John Doe');
    assert.strictEqual(validated.email, 'john@example.com');
  });

  test('Validator should throw ValidationError with detailed messages on invalid data', async () => {
    const input = {
      name: 'Jo',
      email: 'not-an-email',
      password: 'short',
      password_confirmation: 'different',
      role: 'superman',
    };

    try {
      await Validator.validate(input, {
        name: 'required|min:3',
        email: 'required|email',
        password: 'required|min:6|confirmed',
        role: 'required|in:admin,user',
      });
      assert.fail('Should have thrown ValidationError');
    } catch (err: any) {
      assert.strictEqual(err.name, 'ValidationError');
      const errors = err.errors;
      assert.ok(errors.name);
      assert.ok(errors.email);
      assert.ok(errors.password);
      assert.ok(errors.role);
    }
  });
});

describe('BirFramework Storage Tests', () => {
  const testFile = 'test-documents/hello.txt';
  const content = 'Hello BirFramework Storage Engine!';

  after(async () => {
    if (await Storage.exists(testFile)) {
      await Storage.delete(testFile);
    }
  });

  test('Storage should put, check exists, get, and delete files', async () => {
    // 1. Put
    const putOk = await Storage.put(testFile, content);
    assert.strictEqual(putOk, true);

    // 2. Exists
    const exists = await Storage.exists(testFile);
    assert.strictEqual(exists, true);

    // 3. Get
    const read = await Storage.get(testFile);
    assert.strictEqual(read, content);

    // 4. Url
    const url = Storage.url('avatars/me.png');
    assert.strictEqual(url, '/storage/avatars/me.png');

    // 5. Delete
    const deleteOk = await Storage.delete(testFile);
    assert.strictEqual(deleteOk, true);
    assert.strictEqual(await Storage.exists(testFile), false);
  });
});

let processedJobData: string | null = null;

class SendNotificationJob extends Job {
  constructor(public message: string = '') {
    super();
  }

  public async handle(): Promise<void> {
    processedJobData = this.message;
  }
}

describe('BirFramework Queue & Job Tests', () => {
  before(() => {
    process.env.DB_DATABASE = ':memory:';
    dbConnection.connect();
    Queue.register(SendNotificationJob);
  });

  after(() => {
    dbConnection.close();
  });

  test('dispatch should insert job into queue and worker should process it', async () => {
    processedJobData = null;

    // 1. Dispatch job
    const jobId = await dispatch(new SendNotificationJob('Welcome Email to user@example.com'));
    assert.ok(jobId > 0);

    // 2. Run single worker cycle
    const processed = await worker.processNext('default');
    assert.strictEqual(processed, true);
    assert.strictEqual(processedJobData, 'Welcome Email to user@example.com');

    // 3. Queue should now be empty
    const noMoreJobs = await worker.processNext('default');
    assert.strictEqual(noMoreJobs, false);
  });
});
