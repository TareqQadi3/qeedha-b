import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FEATURE_KEYS } from '../subscriptions/constants/feature-keys';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { SubledgerService } from './subledger.service';

@Controller('accounting')
export class SubledgerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerService: SubledgerService,
  ) {}

  @RequireFeature(FEATURE_KEYS.AR_AP)
  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_AR_VIEW)
  @Get('ar/customers')
  listCustomerBalances(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.subledgerService.listCustomerBalances(tx, user.companyId, user.membershipId),
    );
  }

  @RequireFeature(FEATURE_KEYS.AR_AP)
  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_AR_VIEW)
  @Get('ar/customers/:customerId')
  getCustomerStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId') customerId: string,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.subledgerService.getCustomerStatement(tx, user.companyId, user.membershipId, customerId),
    );
  }

  @RequireFeature(FEATURE_KEYS.AR_AP)
  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_AP_VIEW)
  @Get('ap/suppliers')
  listSupplierBalances(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.subledgerService.listSupplierBalances(tx, user.companyId, user.membershipId),
    );
  }

  @RequireFeature(FEATURE_KEYS.AR_AP)
  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_AP_VIEW)
  @Get('ap/suppliers/:supplierId')
  getSupplierStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId') supplierId: string,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.subledgerService.getSupplierStatement(tx, user.companyId, user.membershipId, supplierId),
    );
  }
}
