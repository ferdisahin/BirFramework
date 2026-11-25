import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { ScheduleEvent } from '../src/schedule/event.js';
import { Mail, Mailable } from '../src/mail/index.js';
import { Queue } from '../src/queue/queue.js';
import { worker } from '../src/queue/worker.js';
import { Job } from '../src/queue/job.js';
import { dbConnection } from '../src/database/connection.js';

class FailingInvoiceJob extends Job {
  public override tries = 1;
  constructor(public invoiceId: number) {
    super();
  }
  public async handle(): Promise<void> {
    throw new Error(`Gateway timeout for invoice #${this.invoiceId}`);
  }
}

class InvoiceMailable extends Mailable {
  constructor(private pdfBuffer: Buffer) {
    super();
  }
  public content(): string {
    return '<p>Attached is your monthly invoice.</p>';
  }
}

describe('Phase 3: Schedule withoutOverlapping, Mail attachments, Queue failed_jobs & retry', () => {
  before(async () => {
    process.env.DB_CONNECTION = 'sqlite';
    process.env.DB_DATABASE = ':memory:';
    await Queue.ensureQueueTable();
  });

  after(async () => {
    Mail.restore();
    await dbConnection.close();
  });

  test('ScheduleEvent.withoutOverlapping blocks concurrent overlapping runs', async () => {
    let runCount = 0;
    let release!: () => void;
    const gatePromise = new Promise<void>((r) => {
      release = r;
    });

    const event = new ScheduleEvent(async () => {
      runCount++;
      await gatePromise;
    }, 'Billing Cron').withoutOverlapping();

    const firstRun = event.run();
    assert.strictEqual(event.isDue(new Date()), false);
    await event.run(); // Should skip because firstRun is still active
    assert.strictEqual(runCount, 1);

    release();
    await firstRun;
  });

  test('Mailable.attach includes attachments on outgoing email', async () => {
    const fake = Mail.fake();
    const pdfBuf = Buffer.from('%PDF-1.4 mock invoice');

    const mail = new InvoiceMailable(pdfBuf)
      .subject('Invoice #1042')
      .attach({ filename: 'invoice-1042.pdf', content: pdfBuf, contentType: 'application/pdf' });

    await Mail.to('customer@example.com').send(mail);

    assert.strictEqual(fake.emails.length, 1);
    assert.strictEqual(fake.emails[0]?.attachments?.length, 1);
    assert.strictEqual(fake.emails[0]?.attachments?.[0]?.filename, 'invoice-1042.pdf');
  });

  test('Failed jobs move to _failed_jobs and can be retried or flushed', async () => {
    await Queue.flushFailedJobs();
    Queue.register(FailingInvoiceJob);

    await Queue.push(new FailingInvoiceJob(88));
    await worker.work({ once: true });

    const failed = await Queue.getFailedJobs();
    assert.strictEqual(failed.length, 1);
    assert.strictEqual(failed[0]?.name, 'FailingInvoiceJob');
    assert.ok(failed[0]?.exception.includes('Gateway timeout for invoice #88'));

    const retried = await Queue.retryFailedJob(failed[0]!.id);
    assert.strictEqual(retried, 1);
    assert.strictEqual((await Queue.getFailedJobs()).length, 0);

    // Run again so it fails again, then flush
    await worker.work({ once: true });
    assert.strictEqual((await Queue.getFailedJobs()).length, 1);
    await Queue.flushFailedJobs();
    assert.strictEqual((await Queue.getFailedJobs()).length, 0);
  });
});
