import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IntegrationRegistry } from './core/integration-registry.service';
import { IntegrationsController } from './core/integrations.controller';
import { IntegrationsService } from './core/integrations.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { WebhooksService } from './webhooks/webhooks.service';

@Module({
  imports: [AuditModule],
  controllers: [IntegrationsController, WebhooksController],
  providers: [IntegrationRegistry, IntegrationsService, WebhooksService],
  exports: [IntegrationRegistry],
})
export class IntegrationsModule {}
