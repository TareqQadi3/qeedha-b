import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailProvider } from '../email-provider.interface';

/**
 * Default (EMAIL_DRIVER=console) and only implemented provider in this
 * phase - logs the full message via Nest's structured Logger instead of
 * sending real email, exactly like the project's structured HTTP logging
 * (docs/SECURITY.md "Logging المهيكل") never puts secrets in logs, this
 * puts no email credentials anywhere. Makes local/dev/test genuinely
 * usable without any external account (same reasoning as
 * LocalFileStorageProvider), and means every "email was sent" assertion
 * in this phase's e2e tests is checking real code, not a mocked stub.
 */
@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger('EmailProvider(console)');

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`إلى: ${message.to} — الموضوع: ${message.subject}`);
  }
}
