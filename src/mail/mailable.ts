import { defaultViewEngine } from '../view/engine.js';

export interface MailRecipient {
  email: string;
  name?: string;
}

export abstract class Mailable {
  public toAddress: string = '';
  public fromAddress: string = process.env.MAIL_FROM_ADDRESS || 'noreply@example.com';
  public fromName: string = process.env.MAIL_FROM_NAME || 'BirFramework';
  public subjectText: string = '';

  public to(recipient: string | MailRecipient): this {
    this.toAddress = typeof recipient === 'string' ? recipient : recipient.email;
    return this;
  }

  public from(address: string, name?: string): this {
    this.fromAddress = address;
    if (name) this.fromName = name;
    return this;
  }

  public subject(subj: string): this {
    this.subjectText = subj;
    return this;
  }

  /**
   * Helper to render a Blade view template for the email content
   */
  public view(templateName: string, data: Record<string, any> = {}): string {
    return defaultViewEngine.render(templateName, data);
  }

  abstract content(): Promise<string> | string;
}
