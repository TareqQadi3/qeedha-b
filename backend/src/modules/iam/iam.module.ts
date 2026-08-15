import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BranchScopeService } from './branch-scope.service';
import { IamController } from './iam.controller';
import { IamService } from './iam.service';

@Module({
  imports: [AuditModule],
  controllers: [IamController],
  providers: [IamService, BranchScopeService],
  exports: [IamService, BranchScopeService],
})
export class IamModule {}
