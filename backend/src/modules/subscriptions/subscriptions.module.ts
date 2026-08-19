import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { SUBSCRIPTION_PAYMENT_PROVIDER } from './billing/subscription-payment-provider.interface';
import { UnconfiguredSubscriptionPaymentProvider } from './billing/providers/unconfigured-payment-provider';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionService } from './subscription.service';

/**
 * `SUBSCRIPTION_PAYMENT_DRIVER` selects the SubscriptionPaymentProvider
 * bound to SUBSCRIPTION_PAYMENT_PROVIDER - same fail-fast-on-unsupported-
 * driver pattern as EmailModule/StorageModule. Only "none" (the default,
 * safe placeholder that never fakes a successful charge) is implemented in
 * this phase; see subscription-payment-provider.interface.ts for how a
 * real gateway plugs in later.
 */
@Module({
  imports: [AuditModule, ConfigModule],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionService,
    {
      provide: SUBSCRIPTION_PAYMENT_PROVIDER,
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('SUBSCRIPTION_PAYMENT_DRIVER') ?? 'none';
        if (driver !== 'none') {
          throw new Error(
            `SUBSCRIPTION_PAYMENT_DRIVER="${driver}" غير مدعوم في هذه المرحلة - "none" فقط متاح حاليًا.`,
          );
        }
        return new UnconfiguredSubscriptionPaymentProvider();
      },
      inject: [ConfigService],
    },
  ],
  exports: [SubscriptionService],
})
export class SubscriptionsModule {}
