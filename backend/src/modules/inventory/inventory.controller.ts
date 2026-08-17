import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FEATURE_KEYS } from '../subscriptions/constants/feature-keys';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { QueryStockCountsDto } from './dto/query-stock-counts.dto';
import { QueryStockLevelsDto } from './dto/query-stock-levels.dto';
import { QueryStockMovementsDto } from './dto/query-stock-movements.dto';
import { SetOpeningBalanceDto } from './dto/set-opening-balance.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { UpdateStockCountLinesDto } from './dto/update-stock-count-lines.dto';
import { InventoryService } from './inventory.service';
import { StockCountService } from './stock-count.service';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly stockCountService: StockCountService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.INVENTORY_READ)
  @Get('stock-levels')
  listStockLevels(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryStockLevelsDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.inventoryService.listStockLevels(tx, user.companyId, user.membershipId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.INVENTORY_READ)
  @Get('movements')
  listMovements(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryStockMovementsDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.inventoryService.listStockMovements(tx, user.companyId, user.membershipId, query),
    );
  }

  @RequireFeature(FEATURE_KEYS.INVENTORY)
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_ADJUST)
  @Post('opening-balance')
  setOpeningBalance(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetOpeningBalanceDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.inventoryService.setOpeningBalance(
        tx,
        user.companyId,
        user.membershipId,
        user.userId,
        dto,
      ),
    );
  }

  @RequireFeature(FEATURE_KEYS.INVENTORY)
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_ADJUST)
  @Post('adjustments')
  adjustStock(@CurrentUser() user: AuthenticatedUser, @Body() dto: AdjustStockDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.inventoryService.adjustStock(tx, user.companyId, user.membershipId, user.userId, dto),
    );
  }

  @RequireFeature(FEATURE_KEYS.INVENTORY)
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_TRANSFER)
  @Post('transfers')
  transferStock(@CurrentUser() user: AuthenticatedUser, @Body() dto: TransferStockDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.inventoryService.transferStock(tx, user.companyId, user.membershipId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.INVENTORY_COUNT)
  @Get('stock-counts')
  listStockCounts(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryStockCountsDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.stockCountService.list(tx, user.companyId, user.membershipId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.INVENTORY_COUNT)
  @Get('stock-counts/:id')
  getStockCount(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.stockCountService.getOwnedForMembership(tx, user.companyId, user.membershipId, id),
    );
  }

  @RequireFeature(FEATURE_KEYS.INVENTORY)
  @RequirePermissions(PERMISSION_KEYS.INVENTORY_COUNT)
  @Post('stock-counts')
  createStockCount(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStockCountDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.stockCountService.create(tx, user.companyId, user.membershipId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.INVENTORY_COUNT)
  @Patch('stock-counts/:id/lines')
  updateStockCountLines(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStockCountLinesDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.stockCountService.updateLines(
        tx,
        user.companyId,
        user.membershipId,
        user.userId,
        id,
        dto,
      ),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.INVENTORY_COUNT)
  @Post('stock-counts/:id/complete')
  completeStockCount(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.stockCountService.complete(tx, user.companyId, user.membershipId, user.userId, id),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.INVENTORY_COUNT)
  @Post('stock-counts/:id/cancel')
  cancelStockCount(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.stockCountService.cancel(tx, user.companyId, user.membershipId, user.userId, id),
    );
  }
}
