import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.INVOICES_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryInvoicesDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.invoicesService.list(tx, user.companyId, user.membershipId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.INVOICES_READ)
  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.invoicesService.getOwnedForMembership(tx, user.companyId, user.membershipId, id),
    );
  }
}
