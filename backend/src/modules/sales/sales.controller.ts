import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FEATURE_KEYS } from '../subscriptions/constants/feature-keys';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { QuerySalesDto } from './dto/query-sales.dto';
import { RecordSalePaymentDto } from './dto/record-sale-payment.dto';
import { SalesReturnService } from './sales-return.service';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
    private readonly salesReturnService: SalesReturnService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.SALES_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QuerySalesDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.salesService.list(tx, user.companyId, user.membershipId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.SALES_READ)
  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.salesService.getOwnedForMembership(tx, user.companyId, user.membershipId, id),
    );
  }

  /**
   * On a true-concurrent duplicate (two identical clientReferenceId requests
   * racing each other), SalesService.createSale's `tx.sale.create` loses the
   * unique-constraint race and throws - caught here, re-fetched, and
   * returned instead of surfacing as an error. See docs/SALES.md
   * "Idempotency" for why this can't live inside the transaction itself.
   */
  @RequireFeature(FEATURE_KEYS.POS)
  @RequirePermissions(PERMISSION_KEYS.SALES_CREATE)
  @Post()
  async createSale(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSaleDto) {
    try {
      return await this.prisma.withTenant(user.companyId, (tx) =>
        this.salesService.createSale(tx, user.companyId, user.membershipId, user.userId, dto),
      );
    } catch (err) {
      if (this.salesService.isDuplicateClientReference(err)) {
        return this.prisma.withTenant(user.companyId, (tx) =>
          this.salesService.getByClientReference(tx, user.companyId, dto.clientReferenceId),
        );
      }
      throw err;
    }
  }

  @RequireFeature(FEATURE_KEYS.POS)
  @RequirePermissions(PERMISSION_KEYS.SALES_CANCEL)
  @Post(':id/cancel')
  cancelSale(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.salesService.cancelSale(tx, user.companyId, user.membershipId, user.userId, id),
    );
  }

  /** Milestone 7: settles (part of) a sale's outstanding AR balance - see SalesService.recordPayment. Same duplicate-race handling as createSale. */
  @RequireFeature(FEATURE_KEYS.AR_AP)
  @RequirePermissions(PERMISSION_KEYS.SALES_PAYMENT_RECORD)
  @Post(':id/payments')
  async recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordSalePaymentDto,
  ) {
    try {
      return await this.prisma.withTenant(user.companyId, (tx) =>
        this.salesService.recordPayment(
          tx,
          user.companyId,
          user.membershipId,
          user.userId,
          id,
          dto,
        ),
      );
    } catch (err) {
      if (this.salesService.isDuplicateClientReference(err)) {
        return this.prisma.withTenant(user.companyId, (tx) =>
          this.salesService.getOwnedForMembership(tx, user.companyId, user.membershipId, id),
        );
      }
      throw err;
    }
  }

  /** Milestone 7: a genuine partial/full sales return - see SalesReturnService. */
  @RequireFeature(FEATURE_KEYS.POS)
  @RequirePermissions(PERMISSION_KEYS.SALES_RETURN)
  @Post(':id/returns')
  async createReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSaleReturnDto,
  ) {
    try {
      return await this.prisma.withTenant(user.companyId, (tx) =>
        this.salesReturnService.createReturn(
          tx,
          user.companyId,
          user.membershipId,
          user.userId,
          id,
          dto,
        ),
      );
    } catch (err) {
      if (this.salesService.isDuplicateClientReference(err)) {
        return this.prisma.withTenant(user.companyId, (tx) =>
          this.salesReturnService.list(tx, user.companyId, user.membershipId, id),
        );
      }
      throw err;
    }
  }

  @RequirePermissions(PERMISSION_KEYS.SALES_READ)
  @Get(':id/returns')
  listReturns(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.salesReturnService.list(tx, user.companyId, user.membershipId, id),
    );
  }
}
