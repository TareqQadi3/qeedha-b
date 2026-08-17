import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BranchScopeService } from './branch-scope.service';
import { IamController } from './iam.controller';
import { IamService } from './iam.service';

@Module({
  imports: [AuditModule, SubscriptionsModule],
  controllers: [IamController],
  providers: [IamService, BranchScopeService],
  exports: [IamService, BranchScopeService],
})
export class IamModule {}
