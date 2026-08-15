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
import { AuditService } from '../audit/audit.service';
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
   */
  async recordMovement(tx: TenantClient, companyId: string, params: RecordMovementParams) {
    // Prisma's upsert() is NOT atomic against a concurrent upsert on the
    // same unique key on Postgres (it compiles to a transaction-wrapped
    // SELECT-then-INSERT-or-UPDATE, not a native ON CONFLICT) - two
    // concurrent first-ever movements for the same (warehouse, product)
    // would both see "no row" and both attempt INSERT, and the loser hits
    // the unique constraint. A raw `INSERT ... ON CONFLICT DO NOTHING` is
    // genuinely atomic at the Postgres level: exactly one concurrent
    // inserter wins, the rest silently no-op.
    await tx.$executeRaw`
      INSERT INTO stock_levels (id, company_id, warehouse_id, product_id, quantity_on_hand, reserved_quantity, updated_at)
      VALUES (gen_random_uuid(), ${companyId}::uuid, ${params.warehouseId}::uuid, ${params.productId}::uuid, 0, 0, now())
      ON CONFLICT (company_id, warehouse_id, product_id) DO NOTHING
    `;

    const updated = await tx.$queryRaw<{ quantity_on_hand: Prisma.Decimal }[]>`
      UPDATE stock_levels
      SET quantity_on_hand = quantity_on_hand + ${params.quantity}, updated_at = now()
      WHERE company_id = ${companyId}::uuid
        AND warehouse_id = ${params.warehouseId}::uuid
        AND product_id = ${params.productId}::uuid
        AND quantity_on_hand + ${params.quantity} >= 0
      RETURNING quantity_on_hand
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

    return { movement, quantityOnHand: updated[0].quantity_on_hand };
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
    await this.assertWarehouseOwned(tx, companyId, dto.warehouseId, scope);
    await this.assertProductOwned(tx, companyId, dto.productId);

    const { movement, quantityOnHand } = await this.recordMovement(tx, companyId, {
      warehouseId: dto.warehouseId,
      productId: dto.productId,
      type: 'adjustment',
      quantity: dto.quantityDelta,
      referenceType: 'StockAdjustment',
      actorMembershipId,
      notes: dto.notes,
    });

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
    const inMovement = await this.recordMovement(tx, companyId, {
      warehouseId: dto.toWarehouseId,
      productId: dto.productId,
      type: 'transfer_in',
      quantity: dto.quantity,
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
