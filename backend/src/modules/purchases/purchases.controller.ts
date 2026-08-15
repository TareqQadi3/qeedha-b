import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { QueryPurchasesDto } from './dto/query-purchases.dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchasesService: PurchasesService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.PURCHASES_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryPurchasesDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.purchasesService.list(tx, user.companyId, user.membershipId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PURCHASES_READ)
  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.purchasesService.getOwnedForMembership(tx, user.companyId, user.membershipId, id),
    );
  }

  /** Same idempotency-race handling as SalesController.createSale - see docs/PURCHASING.md "Idempotency". */
  @RequirePermissions(PERMISSION_KEYS.PURCHASES_CREATE)
  @Post()
  async createPurchase(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseDto) {
    try {
      return await this.prisma.withTenant(user.companyId, (tx) =>
        this.purchasesService.createPurchase(
          tx,
          user.companyId,
          user.membershipId,
          user.userId,
          dto,
        ),
      );
    } catch (err) {
      if (this.purchasesService.isDuplicateClientReference(err)) {
        return this.prisma.withTenant(user.companyId, (tx) =>
          this.purchasesService.getByClientReference(tx, user.companyId, dto.clientReferenceId),
        );
      }
      throw err;
    }
  }

  @RequirePermissions(PERMISSION_KEYS.PURCHASES_CREATE)
  @Post(':id/receive')
  receivePurchase(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.purchasesService.receivePurchase(tx, user.companyId, user.membershipId, user.userId, id),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PURCHASES_CANCEL)
  @Post(':id/cancel')
  cancelPurchase(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.purchasesService.cancelPurchase(tx, user.companyId, user.membershipId, user.userId, id),
    );
  }
}
