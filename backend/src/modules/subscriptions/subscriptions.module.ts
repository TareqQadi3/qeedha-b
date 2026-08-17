import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionService } from './subscription.service';

@Module({
  imports: [AuditModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionsModule {}
