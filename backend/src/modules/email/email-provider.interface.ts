export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

/**
 * Provider-agnostic port for transactional email (Website phase spec
 * "Email notifications" - "Use the existing email infrastructure. Do not
 * duplicate email services."). Same shape as `FileStorageProvider`
 * (storage/file-storage-provider.interface.ts): one minimal interface,
 * two implementations - `ConsoleEmailProvider` (genuinely testable, no
 * external account needed, the default) and `SmtpEmailProvider` (Phase 9
 * - real delivery via nodemailer, selected with `EMAIL_DRIVER=smtp`,
 * requires real provider credentials - see EmailModule). Any real
 * SMTP-compatible provider (SendGrid, SES, Resend, Postmark, Mailgun,
 * ...) works through SmtpEmailProvider unchanged - only env vars differ.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
