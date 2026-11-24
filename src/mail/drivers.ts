export interface MailAttachment {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

export interface OutgoingEmail {
  to: string;
  from: string;
  fromName?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
  sentAt: Date;
}

export interface MailDriver {
  send(email: OutgoingEmail): Promise<boolean>;
}

export class LogMailDriver implements MailDriver {
  public async send(email: OutgoingEmail): Promise<boolean> {
    console.log('\n\x1b[36m┌─── [BirMail LOG] ────────────────────────────────────────────────────────┐\x1b[0m');
    console.log(`│ \x1b[1mTo:\x1b[0m      ${email.to}`);
    console.log(`│ \x1b[1mFrom:\x1b[0m    ${email.fromName ? `${email.fromName} <${email.from}>` : email.from}`);
    console.log(`│ \x1b[1mSubject:\x1b[0m ${email.subject}`);
    console.log(`│ \x1b[1mDate:\x1b[0m    ${email.sentAt.toISOString()}`);
    if (email.attachments && email.attachments.length > 0) {
      console.log(`│ \x1b[1mFiles:\x1b[0m   ${email.attachments.map((a) => a.filename).join(', ')}`);
    }
    console.log('├──────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ ${email.html.replace(/\n/g, '\n│ ')}`);
    console.log('\x1b[36m└──────────────────────────────────────────────────────────────────────────┘\x1b[0m\n');
    return true;
  }
}

export class ArrayMailDriver implements MailDriver {
  public emails: OutgoingEmail[] = [];

  public async send(email: OutgoingEmail): Promise<boolean> {
    this.emails.push(email);
    return true;
  }

  public flush(): void {
    this.emails = [];
  }
}
