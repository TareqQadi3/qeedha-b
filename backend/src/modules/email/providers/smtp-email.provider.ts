import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { EmailMessage, EmailProvider } from '../email-provider.interface';

export interface SmtpEmailProviderConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/**
 * Phase 9 ("replace console-only design with a proper provider
 * abstraction... keep the system ready for SMTP/Resend/SES"). Real,
 * functioning delivery via `nodemailer` (a mature, independently-tested
 * library - not a hand-rolled SMTP client) rather than a stub. Selected
 * by EMAIL_DRIVER="smtp" - REQUIRES REAL PROVIDER CREDENTIALS
 * (SMTP_HOST/PORT/USER/PASSWORD/FROM) to actually deliver mail; see
 * EmailModule for the fail-fast check that runs before this is
 * constructed. Every real SMTP-compatible provider (AWS SES SMTP
 * endpoint, SendGrid, Resend's SMTP endpoint, Postmark, Mailgun, a plain
 * company mail server, ...) works through this same class - only the env
 * vars change, never the code.
 */
@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger('EmailProvider(smtp)');
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpEmailProviderConfig) {
    this.from = config.from;
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
      });
    } catch (error) {
      // Never a secret (credentials) in this log line - only the
      // recipient/subject and the provider's own error message, same
      // "structured logging, no secrets" discipline as docs/SECURITY.md.
      this.logger.error(
        `تعذّر إرسال البريد إلى ${message.to}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
