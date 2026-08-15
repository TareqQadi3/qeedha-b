import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IamModule } from '../iam/iam.module';
import { AccountingReportsController } from './accounting-reports.controller';
import { AccountingReportsService } from './accounting-reports.service';
import { AccountingService } from './accounting.service';
import { AccountsController } from './accounts.controller';
import { FiscalPeriodsController } from './fiscal-periods.controller';
import { FiscalPeriodsService } from './fiscal-periods.service';
import { JournalEntriesController } from './journal-entries.controller';
import { JournalService } from './journal.service';
import { OpeningBalanceController } from './opening-balance.controller';
import { OpeningBalanceService } from './opening-balance.service';
import { SubledgerController } from './subledger.controller';
import { SubledgerService } from './subledger.service';

@Module({
  imports: [AuditModule, IamModule],
  controllers: [
    AccountsController,
    JournalEntriesController,
    AccountingReportsController,
    SubledgerController,
    OpeningBalanceController,
    FiscalPeriodsController,
  ],
  providers: [
    AccountingService,
    JournalService,
    FiscalPeriodsService,
    AccountingReportsService,
    SubledgerService,
    OpeningBalanceService,
  ],
  exports: [AccountingService, JournalService, FiscalPeriodsService],
})
export class AccountingModule {}
