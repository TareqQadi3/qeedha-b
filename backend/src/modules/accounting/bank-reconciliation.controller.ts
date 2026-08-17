import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { BankReconciliationService } from './bank-reconciliation.service';
import { ACCOUNT_CODES } from './constants/default-chart-of-accounts';
import { CreateBankReconciliationDto } from './dto/create-bank-reconciliation.dto';

class QueryBankReconciliationsDto {
  @IsOptional()
  @IsIn([ACCOUNT_CODES.CASH, ACCOUNT_CODES.BANK])
  accountCode?: string;
}

@Controller('accounting/reconciliations')
export class BankReconciliationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bankReconciliationService: BankReconciliationService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryBankReconciliationsDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.bankReconciliationService.list(tx, user.companyId, query.accountCode),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_RECONCILIATION_MANAGE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBankReconciliationDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.bankReconciliationService.create(
        tx,
        user.companyId,
        user.membershipId,
        user.userId,
        dto,
      ),
    );
  }
}
