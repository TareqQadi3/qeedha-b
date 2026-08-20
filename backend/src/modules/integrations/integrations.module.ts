import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { IntegrationRegistry } from './core/integration-registry.service';
import { IntegrationsController } from './core/integrations.controller';
import { IntegrationsService } from './core/integrations.service';
import { QeedhaPaymentProvider } from './providers/qeedha-payment-provider';
import { WebhooksController } from './webhooks/webhooks.controller';
import { WebhooksService } from './webhooks/webhooks.service';

/**
 * `QEEDHA_PAYMENT_DRIVER` selects the PaymentIntegrationPort adapter
 * registered under `qeedha_payments` - same fail-fast-on-unsupported-driver
 * pattern as SubscriptionsModule/EmailModule. Only "none" (the default,
 * safe placeholder that never fakes a successful charge) is implemented in
 * this phase; see providers/qeedha-payment-provider.ts for how a real
 * Qeedha outbound contract plugs in later without touching this module,
 * the port, or the registry again.
 */
@Module({
  imports: [AuditModule, ConfigModule],
  controllers: [IntegrationsController, WebhooksController],
  providers: [IntegrationRegistry, IntegrationsService, WebhooksService],
  exports: [IntegrationRegistry],
})
export class IntegrationsModule implements OnModuleInit {
  constructor(
    private readonly registry: IntegrationRegistry,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const driver = this.config.get<string>('QEEDHA_PAYMENT_DRIVER') ?? 'none';
    if (driver !== 'none') {
      throw new Error(
        `QEEDHA_PAYMENT_DRIVER="${driver}" غير مدعوم في هذه المرحلة - "none" فقط متاح حاليًا.`,
      );
    }
    this.registry.register(new QeedhaPaymentProvider());
  }
}
