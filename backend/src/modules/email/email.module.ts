import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER } from './email-provider.interface';
import { ConsoleEmailProvider } from './providers/console-email.provider';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { EmailService } from './email.service';

/**
 * `EMAIL_DRIVER` selects the EmailProvider implementation bound to
 * EMAIL_PROVIDER - same fail-fast-on-unsupported-driver pattern as
 * StorageModule (STORAGE_DRIVER). "console" (the default, no credentials
 * needed) and "smtp" (Phase 9 - real delivery, REQUIRES REAL PROVIDER
 * CREDENTIALS: SMTP_HOST/PORT/USER/PASSWORD/FROM) are both implemented;
 * an unsupported value still fails fast at boot rather than silently
 * doing nothing.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: EMAIL_PROVIDER,
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('EMAIL_DRIVER') ?? 'console';
        if (driver === 'console') {
          return new ConsoleEmailProvider();
        }
        if (driver === 'smtp') {
          const host = config.get<string>('SMTP_HOST');
          const from = config.get<string>('SMTP_FROM');
          if (!host || !from) {
            throw new Error(
              'EMAIL_DRIVER="smtp" يتطلب ضبط SMTP_HOST وSMTP_FROM على الأقل (بيانات اعتماد مزوّد بريد حقيقي) - راجع .env.example.',
            );
          }
          return new SmtpEmailProvider({
            host,
            port: config.get<number>('SMTP_PORT') ?? 587,
            secure: (config.get<number>('SMTP_PORT') ?? 587) === 465,
            user: config.get<string>('SMTP_USER'),
            password: config.get<string>('SMTP_PASSWORD'),
            from,
          });
        }
        throw new Error(
          `EMAIL_DRIVER="${driver}" غير مدعوم - "console" أو "smtp" فقط متاحان حاليًا.`,
        );
      },
      inject: [ConfigService],
    },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
