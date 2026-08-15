import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { AccountingReportsService } from './accounting-reports.service';
import { QueryBalanceSheetDto } from './dto/query-balance-sheet.dto';
import { QueryDateRangeDto } from './dto/query-date-range.dto';
import { QueryGeneralLedgerDto } from './dto/query-general-ledger.dto';

@Controller('accounting/reports')
export class AccountingReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: AccountingReportsService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_REPORTS_VIEW)
  @Get('trial-balance')
  trialBalance(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryDateRangeDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.reportsService.getTrialBalance(tx, user.companyId, user.membershipId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_REPORTS_VIEW)
  @Get('general-ledger')
  generalLedger(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryGeneralLedgerDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.reportsService.getGeneralLedger(tx, user.companyId, user.membershipId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_REPORTS_VIEW)
  @Get('profit-and-loss')
  profitAndLoss(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryDateRangeDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.reportsService.getProfitAndLoss(tx, user.companyId, user.membershipId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_REPORTS_VIEW)
  @Get('balance-sheet')
  balanceSheet(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryBalanceSheetDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.reportsService.getBalanceSheet(tx, user.companyId, user.membershipId, query),
    );
  }
}
