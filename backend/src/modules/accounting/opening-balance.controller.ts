import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FEATURE_KEYS } from '../subscriptions/constants/feature-keys';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { CreateOpeningBalanceDto } from './dto/create-opening-balance.dto';
import { OpeningBalanceService } from './opening-balance.service';

@Controller('accounting/opening-balance')
export class OpeningBalanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openingBalanceService: OpeningBalanceService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_READ)
  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.openingBalanceService.get(tx, user.companyId),
    );
  }

  @RequireFeature(FEATURE_KEYS.ACCOUNTING)
  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_OPENING_BALANCE_MANAGE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOpeningBalanceDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.openingBalanceService.create(tx, user.companyId, user.membershipId, user.userId, dto),
    );
  }

  @RequireFeature(FEATURE_KEYS.ACCOUNTING)
  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_OPENING_BALANCE_MANAGE)
  @Post('reverse')
  reverse(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.openingBalanceService.reverse(tx, user.companyId, user.membershipId, user.userId),
    );
  }
}
