import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

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

/**
 * Production transactional email driver using the Resend HTTP API (zero dependencies, Serverless compatible).
 */
export class ResendMailDriver implements MailDriver {
  constructor(private apiKey: string, private endpoint: string = 'https://api.resend.com/emails') {
    if (!apiKey) {
      throw new Error('[BirMail] Resend API key is required.');
    }
  }

  public async send(email: OutgoingEmail): Promise<boolean> {
    const fromFormatted = email.fromName ? `${email.fromName} <${email.from}>` : email.from;

    const payload: Record<string, any> = {
      from: fromFormatted,
      to: [email.to],
      subject: email.subject,
      html: email.html,
    };

    if (email.text) {
      payload.text = email.text;
    }

    if (email.attachments && email.attachments.length > 0) {
      payload.attachments = email.attachments.map((att) => {
        const rawContent =
          att.content !== undefined
            ? Buffer.isBuffer(att.content)
              ? att.content
              : Buffer.from(att.content, 'utf-8')
            : att.path
            ? readFileSync(att.path)
            : Buffer.alloc(0);

        return {
          filename: att.filename,
          content: rawContent.toString('base64'),
        };
      });
    }

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`[BirMail Resend] Failed to send email (${res.status}): ${errText}`);
    }

    return true;
  }
}

export interface SmtpOptions {
  host: string;
  port?: number;
  user?: string;
  pass?: string;
  secure?: boolean;
}

/**
 * Zero-dependency raw SMTP Mail Driver over Node.js TCP/TLS sockets.
 */
export class SmtpMailDriver implements MailDriver {
  private host: string;
  private port: number;
  private user?: string;
  private pass?: string;
  private secure: boolean;

  constructor(options: SmtpOptions) {
    this.host = options.host;
    this.port = options.port ?? (options.secure ? 465 : 587);
    this.user = options.user;
    this.pass = options.pass;
    this.secure = options.secure ?? this.port === 465;
  }

  public async send(email: OutgoingEmail): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const socket = this.secure
        ? tlsConnect({ host: this.host, port: this.port })
        : createConnection({ host: this.host, port: this.port });

      socket.setEncoding('utf8');
      let buffer = '';
      let step = 0;

      const sendCmd = (cmd: string) => {
        socket.write(`${cmd}\r\n`);
      };

      const mimeBody = [
        `From: ${email.fromName ? `"${email.fromName}" <${email.from}>` : email.from}`,
        `To: ${email.to}`,
        `Subject: ${email.subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        email.html.replace(/^\./gm, '..'),
        `.`,
      ].join('\r\n');

      socket.on('error', (err) => reject(new Error(`[BirMail SMTP] ${err.message}`)));

      socket.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line || /^\d{3}-/.test(line)) continue; // Wait for final line of multi-line SMTP response
          const code = Number(line.slice(0, 3));
          if (code >= 400) {
            socket.end();
            return reject(new Error(`[BirMail SMTP] Server rejected command at step ${step}: ${line}`));
          }

          if (step === 0 && code === 220) {
            step = 1;
            sendCmd(`EHLO localhost`);
          } else if (step === 1 && code === 250) {
            if (this.user && this.pass) {
              step = 2;
              sendCmd(`AUTH LOGIN`);
            } else {
              step = 4;
              sendCmd(`MAIL FROM:<${email.from}>`);
            }
          } else if (step === 2 && code === 334) {
            step = 3;
            sendCmd(Buffer.from(this.user || '').toString('base64'));
          } else if (step === 3 && code === 334) {
            step = 4;
            sendCmd(Buffer.from(this.pass || '').toString('base64'));
          } else if (step === 4 && (code === 235 || code === 250)) {
            step = 5;
            if (code === 235) {
              sendCmd(`MAIL FROM:<${email.from}>`);
            } else {
              sendCmd(`RCPT TO:<${email.to}>`);
              step = 6;
            }
          } else if (step === 5 && code === 250) {
            step = 6;
            sendCmd(`RCPT TO:<${email.to}>`);
          } else if (step === 6 && code === 250) {
            step = 7;
            sendCmd(`DATA`);
          } else if (step === 7 && code === 354) {
            step = 8;
            sendCmd(mimeBody);
          } else if (step === 8 && code === 250) {
            step = 9;
            sendCmd(`QUIT`);
            socket.end();
            resolve(true);
          }
        }
      });
    });
  }
}
