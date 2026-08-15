import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { AccountingService } from './accounting.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('accounting/accounts')
export class AccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingService: AccountingService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.accountingService.listAccounts(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_MANAGE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAccountDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.accountingService.createAccount(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_MANAGE)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.accountingService.updateAccount(tx, user.companyId, user.userId, id, dto),
    );
  }
}
