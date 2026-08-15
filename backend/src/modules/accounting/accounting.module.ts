import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IamModule } from '../iam/iam.module';
import { AccountingService } from './accounting.service';
import { AccountsController } from './accounts.controller';
import { JournalEntriesController } from './journal-entries.controller';
import { JournalService } from './journal.service';

@Module({
  imports: [AuditModule, IamModule],
  controllers: [AccountsController, JournalEntriesController],
  providers: [AccountingService, JournalService],
  exports: [AccountingService, JournalService],
})
export class AccountingModule {}
