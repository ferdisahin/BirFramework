import { type MailDriver, LogMailDriver, ArrayMailDriver, type OutgoingEmail } from './drivers.js';
import { Mailable } from './mailable.js';

function sanitizeEmailHeader(str?: string): string {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[\r\n]+/g, ' ').trim();
}

export class PendingMail {
  private recipient: string;
  private manager: MailManager;

  constructor(recipient: string, manager: MailManager) {
    this.recipient = sanitizeEmailHeader(recipient);
    this.manager = manager;
  }

  public async send(mailable: Mailable): Promise<boolean> {
    mailable.to(this.recipient);
    return this.manager.send(mailable);
  }

  public async raw(content: string, options: { subject: string; from?: string }): Promise<boolean> {
    const email: OutgoingEmail = {
      to: this.recipient,
      from: sanitizeEmailHeader(options.from || process.env.MAIL_FROM_ADDRESS || 'noreply@example.com'),
      subject: sanitizeEmailHeader(options.subject),
      html: content,
      sentAt: new Date(),
    };
    return this.manager.getDriver().send(email);
  }
}

export class MailManager {
  private driver: MailDriver;
  private fakeDriver: ArrayMailDriver | null = null;

  constructor(driver?: MailDriver) {
    this.driver = driver || new LogMailDriver();
  }

  public setDriver(driver: MailDriver): this {
    this.driver = driver;
    return this;
  }

  public getDriver(): MailDriver {
    return this.fakeDriver || this.driver;
  }

  public to(recipient: string): PendingMail {
    return new PendingMail(recipient, this);
  }

  public async send(mailable: Mailable): Promise<boolean> {
    const html = await mailable.content();
    const email: OutgoingEmail = {
      to: sanitizeEmailHeader(mailable.toAddress),
      from: sanitizeEmailHeader(mailable.fromAddress),
      fromName: sanitizeEmailHeader(mailable.fromName),
      subject: sanitizeEmailHeader(mailable.subjectText),
      html,
      sentAt: new Date(),
    };

    return this.getDriver().send(email);
  }

  /**
   * Replace the current mailer with an in-memory fake for testing
   */
  public fake(): ArrayMailDriver {
    this.fakeDriver = new ArrayMailDriver();
    return this.fakeDriver;
  }

  public restore(): void {
    this.fakeDriver = null;
  }

  public sent(): OutgoingEmail[] {
    return this.fakeDriver ? this.fakeDriver.emails : [];
  }
}

export const Mail = new MailManager();
