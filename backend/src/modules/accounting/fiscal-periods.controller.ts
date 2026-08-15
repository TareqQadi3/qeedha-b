import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { CreateFiscalPeriodDto } from './dto/create-fiscal-period.dto';
import { FiscalPeriodsService } from './fiscal-periods.service';

@Controller('accounting/fiscal-periods')
export class FiscalPeriodsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscalPeriodsService: FiscalPeriodsService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.fiscalPeriodsService.list(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_PERIOD_MANAGE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFiscalPeriodDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.fiscalPeriodsService.create(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_PERIOD_MANAGE)
  @Post(':id/close')
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.fiscalPeriodsService.close(tx, user.companyId, user.membershipId, user.userId, id),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_PERIOD_MANAGE)
  @Post(':id/reopen')
  reopen(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.fiscalPeriodsService.reopen(tx, user.companyId, user.userId, id),
    );
  }
}
