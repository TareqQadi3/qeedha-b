import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { QueryPurchasesDto } from './dto/query-purchases.dto';
import { RecordSupplierPaymentDto } from './dto/record-supplier-payment.dto';
import { PurchaseReturnService } from './purchase-return.service';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchasesService: PurchasesService,
    private readonly purchaseReturnService: PurchaseReturnService,
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

  /** Milestone 7: settles (part of) a purchase's outstanding AP balance - see PurchasesService.recordPayment. */
  @RequirePermissions(PERMISSION_KEYS.PURCHASES_PAYMENT_RECORD)
  @Post(':id/payments')
  async recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordSupplierPaymentDto,
  ) {
    try {
      return await this.prisma.withTenant(user.companyId, (tx) =>
        this.purchasesService.recordPayment(
          tx,
          user.companyId,
          user.membershipId,
          user.userId,
          id,
          dto,
        ),
      );
    } catch (err) {
      if (this.purchasesService.isDuplicateClientReference(err)) {
        return this.prisma.withTenant(user.companyId, (tx) =>
          this.purchasesService.getOwnedForMembership(tx, user.companyId, user.membershipId, id),
        );
      }
      throw err;
    }
  }

  /** Milestone 7: a genuine partial/full purchase return - see PurchaseReturnService. */
  @RequirePermissions(PERMISSION_KEYS.PURCHASES_RETURN)
  @Post(':id/returns')
  async createReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreatePurchaseReturnDto,
  ) {
    try {
      return await this.prisma.withTenant(user.companyId, (tx) =>
        this.purchaseReturnService.createReturn(
          tx,
          user.companyId,
          user.membershipId,
          user.userId,
          id,
          dto,
        ),
      );
    } catch (err) {
      if (this.purchasesService.isDuplicateClientReference(err)) {
        return this.prisma.withTenant(user.companyId, (tx) =>
          this.purchaseReturnService.list(tx, user.companyId, user.membershipId, id),
        );
      }
      throw err;
    }
  }

  @RequirePermissions(PERMISSION_KEYS.PURCHASES_READ)
  @Get(':id/returns')
  listReturns(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.purchaseReturnService.list(tx, user.companyId, user.membershipId, id),
    );
  }
}
