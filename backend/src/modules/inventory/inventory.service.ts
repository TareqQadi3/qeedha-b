import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { round2 } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_CODES } from '../accounting/constants/default-chart-of-accounts';
import { JournalService } from '../accounting/journal.service';
import { BranchScope, BranchScopeService } from '../iam/branch-scope.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { QueryStockLevelsDto } from './dto/query-stock-levels.dto';
import { QueryStockMovementsDto } from './dto/query-stock-movements.dto';
import { SetOpeningBalanceDto } from './dto/set-opening-balance.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';

export interface RecordMovementParams {
  warehouseId: string;
  productId: string;
  type: StockMovementType;
  /** Signed: positive = in, negative = out. */
  quantity: number;
  /**
   * Only meaningful when `quantity > 0` (Milestone 6, docs/ACCOUNTING.md
   * "COGS / Inventory Valuation"). Omit to let the atomic UPDATE fall back
   * to the current average cost (if this warehouse/product already carries
   * stock) or `Product.costPrice` (if this is the first stock-in ever for
   * this warehouse/product) - see `recordMovement`'s SQL comment for why
   * that fallback is safe and deliberate, not silent guessing. Ignored
   * (never read) when `quantity <= 0` - an outgoing movement never changes
   * the average cost.
   */
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  actorMembershipId?: string | null;
  notes?: string;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly auditService: AuditService,
    private readonly branchScopeService: BranchScopeService,
    private readonly journalService: JournalService,
  ) {}

  /**
   * The ONLY write path to stock_levels. Concurrency strategy (see
   * docs/INVENTORY.md "Concurrency"): a single guarded UPDATE statement -
   * `SET quantity_on_hand = quantity_on_hand + $delta WHERE ... AND
   * quantity_on_hand + $delta >= 0` - is atomic at the Postgres row level.
   * Two concurrent requests against the same (warehouse, product) row
   * serialize on that row's write lock automatically; there is no
   * read-then-write gap for a race to exploit, and a movement that would
   * drive stock negative is rejected by the WHERE clause itself rather than
   * by a separate check after the fact.
   *
   * Milestone 6 (docs/ACCOUNTING.md "COGS / Inventory Valuation"): the SAME
   * statement also maintains `average_cost` (moving weighted average),
   * because "don't let quantity change without updating cost basis" can
   * only be guaranteed if both are written by one atomic UPDATE - a
   * separate follow-up write would reopen exactly the race window the
   * guarded UPDATE above exists to close. For an incoming movement
   * (quantity > 0):
   *   new_average = (qty_on_hand * average_cost + quantity * effective_cost)
   *                 / (qty_on_hand + quantity)
   * where `effective_cost` is `params.unitCost` when given, else the
   * CURRENT average_cost if this row already carries stock (a deliberate,
   * documented no-op fallback for callers with no cost information, e.g. a
   * stock-count "found more" line - see StockCountService), else
   * `Product.costPrice` if this is the first stock-in ever for this
   * (warehouse, product) - the only place in this codebase Product.costPrice
   * is still read for a stock movement. For an outgoing movement
   * (quantity <= 0), average_cost is left untouched (moving-average COGS
   * never changes the average on an issue, only on a receipt) - the
   * RETURNED average_cost is therefore exactly the correct unit cost for the
   * caller to compute COGS/valuation with.
   */
  async recordMovement(tx: TenantClient, companyId: string, params: RecordMovementParams) {
    // Prisma's upsert() is NOT atomic against a concurrent upsert on the
    // same unique key on Postgres (it compiles to a transaction-wrapped
    // SELECT-then-INSERT-or-UPDATE, not a native ON CONFLICT) - two
    // concurrent first-ever movements for the same (warehouse, product)
    // would both see "no row" and both attempt INSERT, and the loser hits
    // the unique constraint. A raw `INSERT ... ON CONFLICT DO NOTHING` is
    // genuinely atomic at the Postgres level: exactly one concurrent
    // inserter wins, the rest silently no-op. average_cost is left at its
    // column default (0) here - the UPDATE below always runs immediately
    // after and sets the real value for an incoming movement.
    await tx.$executeRaw`
      INSERT INTO stock_levels (id, company_id, warehouse_id, product_id, quantity_on_hand, reserved_quantity, updated_at)
      VALUES (gen_random_uuid(), ${companyId}::uuid, ${params.warehouseId}::uuid, ${params.productId}::uuid, 0, 0, now())
      ON CONFLICT (company_id, warehouse_id, product_id) DO NOTHING
    `;

    const unitCost = params.unitCost ?? null;
    const updated = await tx.$queryRaw<
      { quantity_on_hand: Prisma.Decimal; average_cost: Prisma.Decimal }[]
    >`
      UPDATE stock_levels
      SET quantity_on_hand = quantity_on_hand + ${params.quantity},
          average_cost = CASE
            WHEN ${params.quantity} > 0 THEN
              (quantity_on_hand * average_cost + ${params.quantity} * COALESCE(
                ${unitCost}::decimal,
                CASE
                  WHEN quantity_on_hand > 0 THEN average_cost
                  ELSE (SELECT cost_price FROM products WHERE id = ${params.productId}::uuid)
                END
              )) / (quantity_on_hand + ${params.quantity})
            ELSE average_cost
          END,
          updated_at = now()
      WHERE company_id = ${companyId}::uuid
        AND warehouse_id = ${params.warehouseId}::uuid
        AND product_id = ${params.productId}::uuid
        AND quantity_on_hand + ${params.quantity} >= 0
      RETURNING quantity_on_hand, average_cost
    `;
    if (updated.length === 0) {
      throw new ConflictException('الكمية المتاحة غير كافية لإتمام هذه الحركة');
    }

    const movement = await tx.stockMovement.create({
      data: {
        companyId,
        warehouseId: params.warehouseId,
        productId: params.productId,
        type: params.type,
        quantity: params.quantity,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        actorMembershipId: params.actorMembershipId,
        notes: params.notes,
      },
    });

    return {
      movement,
      quantityOnHand: updated[0].quantity_on_hand,
      averageCost: updated[0].average_cost,
    };
  }

  /**
   * Milestone 7 (docs/ACCOUNTING.md "Inventory Adjustment Accounting" /
   * "Stock Count Accounting"): same write as `recordMovement`, but also
   * returns the exact accounting value change (`valueDelta`) so a caller
   * (adjustStock below, StockCountService.complete via
   * InventoryValuationService.recordValuedAdjustment) can post
   * `Dr Inventory / Cr Adjustment Gain` (value increased) or
   * `Dr Adjustment Expense / Cr Inventory` (value decreased).
   *
   * `recordMovement`'s guarded UPDATE only exposes the POST-write
   * quantity/average_cost via RETURNING - there is no way to recover the
   * PRE-write values from it without changing that already-proven SQL. So
   * this method takes its own `SELECT ... FOR UPDATE` snapshot first (after
   * ensuring the row exists, via the same idempotent INSERT ON CONFLICT DO
   * NOTHING recordMovement itself performs), holding the row lock for the
   * rest of this transaction. recordMovement's subsequent UPDATE runs on the
   * SAME connection/transaction and therefore re-enters that same lock
   * (Postgres row locks are transaction-scoped, not session-scoped) instead
   * of blocking on it - no self-deadlock, and no other transaction can
   * interleave a write on this row between the snapshot and the update.
   *
   * valueDelta = new_average_cost * new_quantity - old_average_cost *
   * old_quantity - exact by construction, derived from the same numbers the
   * weighted-average formula itself uses, not an approximation.
   */
  async recordMovementWithValueDelta(
    tx: TenantClient,
    companyId: string,
    params: RecordMovementParams,
  ) {
    await tx.$executeRaw`
      INSERT INTO stock_levels (id, company_id, warehouse_id, product_id, quantity_on_hand, reserved_quantity, updated_at)
      VALUES (gen_random_uuid(), ${companyId}::uuid, ${params.warehouseId}::uuid, ${params.productId}::uuid, 0, 0, now())
      ON CONFLICT (company_id, warehouse_id, product_id) DO NOTHING
    `;
    const before = await tx.$queryRaw<
      { quantity_on_hand: Prisma.Decimal; average_cost: Prisma.Decimal }[]
    >`
      SELECT quantity_on_hand, average_cost FROM stock_levels
      WHERE company_id = ${companyId}::uuid
        AND warehouse_id = ${params.warehouseId}::uuid
        AND product_id = ${params.productId}::uuid
      FOR UPDATE
    `;
    const oldQty = Number(before[0]?.quantity_on_hand ?? 0);
    const oldAvg = Number(before[0]?.average_cost ?? 0);

    const { movement, quantityOnHand, averageCost } = await this.recordMovement(
      tx,
      companyId,
      params,
    );
    const newQty = Number(quantityOnHand);
    const newAvg = Number(averageCost);
    const valueDelta = round2(newAvg * newQty - oldAvg * oldQty);

    return { movement, quantityOnHand, averageCost, valueDelta };
  }

  async listStockLevels(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    query: QueryStockLevelsDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.INVENTORY_READ,
    );

    // A warehouseId outside this tenant, or outside this membership's branch
    // scope, is never rejected here (this is a list/filter endpoint, same
    // convention as every other tenant-isolation filter in this codebase) -
    // it is just ANDed into the where clause like any other filter, so it
    // silently yields zero rows instead of leaking another branch's/tenant's
    // data. Only single-resource, state-changing endpoints (adjustStock,
    // transferStock, stock counts, ...) reject an out-of-scope warehouse.
    const where: Prisma.StockLevelWhereInput = {
      companyId,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...this.warehouseScopeFilter(scope),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.search
        ? { product: { name: { contains: query.search, mode: 'insensitive' as const } } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      tx.stockLevel.findMany({
        where,
        include: { product: true, warehouse: true },
        orderBy: { updatedAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.stockLevel.count({ where }),
    ]);

    const shaped = rows
      .map((row) => ({
        id: row.id,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouse.name,
        productId: row.productId,
        productName: row.product.name,
        productSku: row.product.sku,
        quantityOnHand: row.quantityOnHand,
        reservedQuantity: row.reservedQuantity,
        availableQuantity: row.quantityOnHand.minus(row.reservedQuantity),
        // Milestone 6 (docs/ACCOUNTING.md "COGS / Inventory Valuation"):
        // backward-compatible additions to an existing response - the same
        // moving weighted-average cost the accounting Inventory account is
        // valued from, so this figure and the Balance Sheet never diverge
        // for a product/warehouse that has only ever seen purchases/sales.
        averageCost: row.averageCost,
        inventoryValue: round2(row.quantityOnHand.toNumber() * row.averageCost.toNumber()),
        minStockThreshold: row.product.minStockThreshold,
        isLowStock: row.quantityOnHand.lte(row.product.minStockThreshold),
        updatedAt: row.updatedAt,
      }))
      .filter((row) => !query.lowStockOnly || row.isLowStock);

    return paginate(shaped, query.lowStockOnly ? shaped.length : total, page, pageSize);
  }

  async listStockMovements(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    query: QueryStockMovementsDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.INVENTORY_READ,
    );

    const where: Prisma.StockMovementWhereInput = {
      companyId,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...this.warehouseScopeFilter(scope),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [data, total] = await Promise.all([
      tx.stockMovement.findMany({
        where,
        include: { product: true, warehouse: true },
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.stockMovement.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async setOpeningBalance(
    tx: TenantClient,
    companyId: string,
    actorMembershipId: string,
    actorUserId: string,
    dto: SetOpeningBalanceDto,
  ) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      actorMembershipId,
      PERMISSION_KEYS.INVENTORY_ADJUST,
    );
    await this.assertWarehouseOwned(tx, companyId, dto.warehouseId, scope);
    await this.assertProductOwned(tx, companyId, dto.productId);

    const existing = await tx.stockLevel.findUnique({
      where: {
        companyId_warehouseId_productId: {
          companyId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
        },
      },
    });
    if (existing && !existing.quantityOnHand.isZero()) {
      throw new ConflictException(
        'يوجد رصيد بالفعل لهذا المنتج في هذا المستودع - استخدم تسوية بدلًا من رصيد افتتاحي',
      );
    }

    const { movement, quantityOnHand } = await this.recordMovement(tx, companyId, {
      warehouseId: dto.warehouseId,
      productId: dto.productId,
      type: 'opening_balance',
      quantity: dto.quantity,
      unitCost: dto.unitCost,
      actorMembershipId,
      notes: dto.notes,
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'inventory.opening_balance.set',
      entityType: 'StockMovement',
      entityId: movement.id,
      afterState: {
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        quantity: dto.quantity,
      },
    });

    return { movement, quantityOnHand };
  }

  async adjustStock(
    tx: TenantClient,
    companyId: string,
    actorMembershipId: string,
    actorUserId: string,
    dto: AdjustStockDto,
  ) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      actorMembershipId,
      PERMISSION_KEYS.INVENTORY_ADJUST,
    );
    const warehouse = await this.assertWarehouseOwned(tx, companyId, dto.warehouseId, scope);
    await this.assertProductOwned(tx, companyId, dto.productId);

    const { movement, quantityOnHand, valueDelta } = await this.recordMovementWithValueDelta(
      tx,
      companyId,
      {
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        type: 'adjustment',
        quantity: dto.quantityDelta,
        unitCost: dto.quantityDelta > 0 ? dto.unitCost : undefined,
        referenceType: 'StockAdjustment',
        actorMembershipId,
        notes: dto.notes,
      },
    );

    const adjustment = await tx.stockAdjustment.create({
      data: {
        companyId,
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        quantityDelta: dto.quantityDelta,
        reason: dto.reason,
        notes: dto.notes,
        actorMembershipId,
        stockMovementId: movement.id,
      },
    });
    // Link the movement back to the adjustment that justifies it.
    await tx.stockMovement.update({
      where: { id: movement.id },
      data: { referenceId: adjustment.id },
    });

    // Milestone 7 (docs/ACCOUNTING.md "Inventory Adjustment Accounting"): a
    // zero valueDelta (e.g. a quantity adjustment on a product with zero
    // cost basis) posts no journal entry - JournalService itself rejects a
    // zero-amount entry, and there is nothing to record either way.
    if (Math.abs(valueDelta) >= 0.005) {
      await this.journalService.postJournalEntry(tx, companyId, {
        branchId: warehouse.branchId,
        referenceType: 'StockAdjustment',
        referenceId: adjustment.id,
        description: `تسوية مخزون${dto.reason ? `: ${dto.reason}` : ''}`,
        actorMembershipId,
        actorUserId,
        lines:
          valueDelta > 0
            ? [
                { accountCode: ACCOUNT_CODES.INVENTORY, debit: valueDelta },
                { accountCode: ACCOUNT_CODES.INVENTORY_ADJUSTMENT_GAIN, credit: valueDelta },
              ]
            : [
                {
                  accountCode: ACCOUNT_CODES.INVENTORY_ADJUSTMENT_EXPENSE,
                  debit: Math.abs(valueDelta),
                },
                { accountCode: ACCOUNT_CODES.INVENTORY, credit: Math.abs(valueDelta) },
              ],
      });
    }

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'inventory.adjustment.create',
      entityType: 'StockAdjustment',
      entityId: adjustment.id,
      afterState: {
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        quantityDelta: dto.quantityDelta,
        reason: dto.reason,
        valueDelta,
      },
    });

    return { adjustment, quantityOnHand };
  }

  async transferStock(
    tx: TenantClient,
    companyId: string,
    actorMembershipId: string,
    actorUserId: string,
    dto: TransferStockDto,
  ) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new ConflictException('لا يمكن التحويل إلى نفس المستودع');
    }
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      actorMembershipId,
      PERMISSION_KEYS.INVENTORY_TRANSFER,
    );
    await this.assertWarehouseOwned(tx, companyId, dto.fromWarehouseId, scope);
    await this.assertWarehouseOwned(tx, companyId, dto.toWarehouseId, scope);
    await this.assertProductOwned(tx, companyId, dto.productId);

    const referenceId = randomUUID();

    const out = await this.recordMovement(tx, companyId, {
      warehouseId: dto.fromWarehouseId,
      productId: dto.productId,
      type: 'transfer_out',
      quantity: -dto.quantity,
      referenceType: 'StockTransfer',
      referenceId,
      actorMembershipId,
      notes: dto.notes,
    });
    // The destination receives stock at the SOURCE warehouse's cost basis
    // (its average_cost is unchanged by the outgoing leg above, so `out`'s
    // returned value IS that cost) - a transfer must never invent or lose
    // cost basis, docs/ACCOUNTING.md "COGS / Inventory Valuation" "Transfers".
    const inMovement = await this.recordMovement(tx, companyId, {
      warehouseId: dto.toWarehouseId,
      productId: dto.productId,
      type: 'transfer_in',
      quantity: dto.quantity,
      unitCost: Number(out.averageCost),
      referenceType: 'StockTransfer',
      referenceId,
      actorMembershipId,
      notes: dto.notes,
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'inventory.transfer.create',
      entityType: 'StockMovement',
      entityId: referenceId,
      afterState: {
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        productId: dto.productId,
        quantity: dto.quantity,
      },
    });

    return {
      referenceId,
      outMovementId: out.movement.id,
      inMovementId: inMovement.movement.id,
      fromQuantityOnHand: out.quantityOnHand,
      toQuantityOnHand: inMovement.quantityOnHand,
    };
  }

  /**
   * `scope`, when passed, is the SECOND check layered on top of tenant
   * ownership - see docs/SECURITY.md "نطاق الفروع/المستودعات": tenant
   * ownership answers "does this warehouse belong to this company at all"
   * (404 if not - the resource doesn't exist for this tenant); scope answers
   * "does THIS membership's grant of THIS permission cover the branch this
   * warehouse belongs to" (403 if not - the resource exists, but this
   * membership isn't authorized for its branch). Callers that don't pass a
   * scope get tenant-only enforcement, unchanged from before this scope
   * model existed.
   */
  async assertWarehouseOwned(
    tx: TenantClient,
    companyId: string,
    warehouseId: string,
    scope?: BranchScope,
  ) {
    const warehouse = await tx.warehouse.findFirst({
      where: { id: warehouseId, companyId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('المستودع غير موجود');
    if (scope && !scope.allBranches && !scope.branchIds.has(warehouse.branchId)) {
      throw new ForbiddenException('هذا المستودع خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    return warehouse;
  }

  async assertProductOwned(tx: TenantClient, companyId: string, productId: string) {
    const product = await tx.product.findFirst({
      where: { id: productId, companyId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    return product;
  }

  /** Prisma where-clause fragment restricting a warehouse-relation query to an authorized branch scope. Omit (spread {}) when scope.allBranches. */
  warehouseScopeFilter(
    scope: BranchScope,
  ): { warehouse: { branchId: { in: string[] } } } | Record<string, never> {
    if (scope.allBranches) return {};
    return { warehouse: { branchId: { in: Array.from(scope.branchIds) } } };
  }
}
