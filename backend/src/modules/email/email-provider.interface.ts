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
 * one real implementation (ConsoleEmailProvider - genuinely testable,
 * no external account needed), and a documented-but-not-built path for
 * a real provider once credentials exist (EmailModule fails fast on
 * `EMAIL_DRIVER=smtp` today rather than shipping an untested integration
 * - see EmailModule). A real SMTP/API provider (SendGrid, SES, Resend,
 * Postmark, ...) plugs in behind this exact interface with no change to
 * EmailService or any caller.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
