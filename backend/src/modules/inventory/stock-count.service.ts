import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { AuditService } from '../audit/audit.service';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { QueryStockCountsDto } from './dto/query-stock-counts.dto';
import { UpdateStockCountLinesDto } from './dto/update-stock-count-lines.dto';
import { InventoryService } from './inventory.service';

/**
 * Foundation for physical stock counting (docs/INVENTORY.md "Stock counts").
 * Deliberately minimal for Phase 2: single-pass count (no blind-count mode,
 * no recount workflow, no per-line approval) - draft -> completed|cancelled.
 * A completed count reconciles every counted line against expected stock via
 * the same recordMovement() path adjustments use, so it never bypasses the
 * movement ledger.
 */
@Injectable()
export class StockCountService {
  constructor(
    private readonly auditService: AuditService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(
    tx: TenantClient,
    companyId: string,
    actorMembershipId: string,
    actorUserId: string,
    dto: CreateStockCountDto,
  ) {
    await this.inventoryService.assertWarehouseOwned(tx, companyId, dto.warehouseId);

    const stockLevels = dto.productIds?.length
      ? await tx.stockLevel.findMany({
          where: { companyId, warehouseId: dto.warehouseId, productId: { in: dto.productIds } },
        })
      : await tx.stockLevel.findMany({ where: { companyId, warehouseId: dto.warehouseId } });

    if (dto.productIds?.length && stockLevels.length !== dto.productIds.length) {
      throw new NotFoundException('بعض المنتجات المحددة لا تملك رصيدًا في هذا المستودع');
    }

    const stockCount = await tx.stockCount.create({
      data: {
        companyId,
        warehouseId: dto.warehouseId,
        actorMembershipId,
        notes: dto.notes,
        lines: {
          create: stockLevels.map((level) => ({
            companyId,
            productId: level.productId,
            expectedQuantity: level.quantityOnHand,
          })),
        },
      },
      include: { lines: true },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'inventory.stock_count.create',
      entityType: 'StockCount',
      entityId: stockCount.id,
      afterState: { warehouseId: dto.warehouseId, lineCount: stockCount.lines.length },
    });

    return stockCount;
  }

  list(tx: TenantClient, companyId: string, query: QueryStockCountsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = { companyId, ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) };

    return Promise.all([
      tx.stockCount.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.stockCount.count({ where }),
    ]).then(([data, total]) => paginate(data, total, page, pageSize));
  }

  async getOwned(tx: TenantClient, companyId: string, id: string) {
    const stockCount = await tx.stockCount.findFirst({
      where: { id, companyId },
      include: { lines: { include: { product: true } } },
    });
    if (!stockCount) throw new NotFoundException('الجرد غير موجود');
    return stockCount;
  }

  async updateLines(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    id: string,
    dto: UpdateStockCountLinesDto,
  ) {
    const stockCount = await this.getOwned(tx, companyId, id);
    if (stockCount.status !== 'draft') {
      throw new ConflictException('لا يمكن تعديل جرد مكتمل أو ملغى');
    }

    for (const line of dto.lines) {
      const target = stockCount.lines.find((l) => l.productId === line.productId);
      if (!target) throw new NotFoundException(`المنتج ${line.productId} ليس ضمن هذا الجرد`);
      await tx.stockCountLine.update({
        where: { id: target.id },
        data: { countedQuantity: line.countedQuantity },
      });
    }

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'inventory.stock_count.update_lines',
      entityType: 'StockCount',
      entityId: id,
      afterState: { updatedLines: dto.lines.length },
    });

    return this.getOwned(tx, companyId, id);
  }

  async complete(
    tx: TenantClient,
    companyId: string,
    actorMembershipId: string,
    actorUserId: string,
    id: string,
  ) {
    const stockCount = await this.getOwned(tx, companyId, id);
    if (stockCount.status !== 'draft') {
      throw new ConflictException('هذا الجرد ليس قيد الإعداد');
    }

    const differences: {
      productId: string;
      expected: string;
      counted: string;
      difference: number;
    }[] = [];

    for (const line of stockCount.lines) {
      if (line.countedQuantity === null) continue;
      const difference = line.countedQuantity.minus(line.expectedQuantity);
      if (difference.isZero()) continue;

      await this.inventoryService.recordMovement(tx, companyId, {
        warehouseId: stockCount.warehouseId,
        productId: line.productId,
        type: 'adjustment',
        quantity: difference.toNumber(),
        referenceType: 'StockCount',
        referenceId: stockCount.id,
        actorMembershipId,
        notes: `فرق جرد: متوقع ${line.expectedQuantity} / فعلي ${line.countedQuantity}`,
      });
      differences.push({
        productId: line.productId,
        expected: line.expectedQuantity.toString(),
        counted: line.countedQuantity.toString(),
        difference: difference.toNumber(),
      });
    }

    const completed = await tx.stockCount.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date() },
      include: { lines: true },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'inventory.stock_count.complete',
      entityType: 'StockCount',
      entityId: id,
      afterState: { differences },
    });

    return completed;
  }

  async cancel(tx: TenantClient, companyId: string, actorUserId: string, id: string) {
    const stockCount = await this.getOwned(tx, companyId, id);
    if (stockCount.status !== 'draft') {
      throw new ConflictException('لا يمكن إلغاء جرد مكتمل بالفعل');
    }

    const cancelled = await tx.stockCount.update({ where: { id }, data: { status: 'cancelled' } });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'inventory.stock_count.cancel',
      entityType: 'StockCount',
      entityId: id,
    });

    return cancelled;
  }
}
