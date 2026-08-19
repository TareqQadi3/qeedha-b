import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER } from './email-provider.interface';
import { ConsoleEmailProvider } from './providers/console-email.provider';
import { EmailService } from './email.service';

/**
 * `EMAIL_DRIVER` selects the EmailProvider implementation bound to
 * EMAIL_PROVIDER - same fail-fast-on-unsupported-driver pattern as
 * StorageModule (STORAGE_DRIVER). Only "console" (the default) is
 * implemented in this phase; see email-provider.interface.ts for why a
 * real SMTP/API provider is designed for but not built here.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: EMAIL_PROVIDER,
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('EMAIL_DRIVER') ?? 'console';
        if (driver !== 'console') {
          throw new Error(
            `EMAIL_DRIVER="${driver}" غير مدعوم في هذه المرحلة - "console" فقط متاح حاليًا.`,
          );
        }
        return new ConsoleEmailProvider();
      },
      inject: [ConfigService],
    },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
