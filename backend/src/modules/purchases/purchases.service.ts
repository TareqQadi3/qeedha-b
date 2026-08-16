import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { round2 } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_CODES } from '../accounting/constants/default-chart-of-accounts';
import { JournalService } from '../accounting/journal.service';
import { BranchScope, BranchScopeService } from '../iam/branch-scope.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { InventoryValuationService } from '../inventory/inventory-valuation.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { QueryPurchasesDto } from './dto/query-purchases.dto';
import { PurchaseNumberService } from './purchase-number.service';

const PURCHASE_INCLUDE = {
  items: true,
  supplier: true,
} satisfies Prisma.PurchaseInclude;

/**
 * Purchase IS the supplier bill record (docs/PURCHASING.md) - no separate
 * PurchaseInvoice table. Purchases post as unpaid (Accounts Payable) on
 * receipt; there is no "pay supplier" step in this phase
 * (docs/ACCOUNTING.md "Deferred").
 */
@Injectable()
export class PurchasesService {
  constructor(
    private readonly auditService: AuditService,
    private readonly branchScopeService: BranchScopeService,
    private readonly inventoryValuationService: InventoryValuationService,
    private readonly journalService: JournalService,
    private readonly purchaseNumberService: PurchaseNumberService,
  ) {}

  /**
   * Creates the purchase order/bill only - does NOT touch inventory or
   * accounting. Those only happen on receivePurchase(), a deliberately
   * separate step (docs/PURCHASING.md "Purchase flow") matching real
   * supermarket workflow: goods are ordered, then arrive and are received
   * later, possibly by a different person.
   */
  async createPurchase(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    dto: CreatePurchaseDto,
  ) {
    const existing = await tx.purchase.findUnique({
      where: {
        companyId_clientReferenceId: { companyId, clientReferenceId: dto.clientReferenceId },
      },
      include: PURCHASE_INCLUDE,
    });
    if (existing) return existing;

    const warehouse = await tx.warehouse.findFirst({
      where: { id: dto.warehouseId, companyId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('المستودع غير موجود');

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.PURCHASES_CREATE,
    );
    this.branchScopeService.assertBranchInScope(scope, warehouse.branchId);

    const supplier = await tx.supplier.findFirst({
      where: { id: dto.supplierId, companyId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('المورد غير موجود');

    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    const lineData: {
      productId: string;
      productName: string;
      productSku: string;
      unitCost: number;
      vatRate: number;
      quantity: number;
      discountAmount: number;
      lineSubtotal: number;
      lineTax: number;
      lineTotal: number;
    }[] = [];

    for (const item of dto.items) {
      // Purchasing doesn't require isActive - restocking a temporarily
      // disabled product is a legitimate purchase, unlike selling it.
      const product = await tx.product.findFirst({
        where: { id: item.productId, companyId, deletedAt: null },
      });
      if (!product) throw new NotFoundException(`المنتج غير موجود: ${item.productId}`);

      const vatRate = item.vatRate ?? Number(product.vatRate);
      const lineGross = round2(item.unitCost * item.quantity);
      const discountAmount = item.discountAmount ?? 0;
      if (discountAmount > lineGross) {
        throw new ConflictException(`قيمة الخصم أكبر من قيمة السطر: ${product.name}`);
      }
      const lineSubtotal = round2(lineGross - discountAmount);
      const lineTax = round2((lineSubtotal * vatRate) / 100);
      const lineTotal = round2(lineSubtotal + lineTax);

      subtotal = round2(subtotal + lineGross);
      discountTotal = round2(discountTotal + discountAmount);
      taxTotal = round2(taxTotal + lineTax);

      lineData.push({
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        unitCost: item.unitCost,
        vatRate,
        quantity: item.quantity,
        discountAmount,
        lineSubtotal,
        lineTax,
        lineTotal,
      });
    }

    const totalAmount = round2(subtotal - discountTotal + taxTotal);
    const referenceNumber = await this.purchaseNumberService.issueNext(tx, companyId);

    const purchase = await tx.purchase.create({
      data: {
        companyId,
        branchId: warehouse.branchId,
        warehouseId: warehouse.id,
        supplierId: supplier.id,
        status: 'ordered',
        currency: 'SAR',
        subtotal,
        discountAmount: discountTotal,
        taxAmount: taxTotal,
        totalAmount,
        referenceNumber,
        clientReferenceId: dto.clientReferenceId,
        actorMembershipId: membershipId,
      },
    });

    for (const line of lineData) {
      await tx.purchaseItem.create({
        data: {
          companyId,
          purchaseId: purchase.id,
          productId: line.productId,
          productName: line.productName,
          productSku: line.productSku,
          unitCost: line.unitCost,
          vatRate: line.vatRate,
          quantity: line.quantity,
          discountAmount: line.discountAmount,
          lineSubtotal: line.lineSubtotal,
          lineTax: line.lineTax,
          lineTotal: line.lineTotal,
        },
      });
    }

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId: warehouse.branchId,
      action: 'purchases.purchase.create',
      entityType: 'Purchase',
      entityId: purchase.id,
      afterState: {
        referenceNumber,
        supplierId: supplier.id,
        totalAmount,
        itemCount: lineData.length,
      },
    });

    return this.getOwned(tx, companyId, purchase.id);
  }

  async getByClientReference(tx: TenantClient, companyId: string, clientReferenceId: string) {
    const purchase = await tx.purchase.findUnique({
      where: { companyId_clientReferenceId: { companyId, clientReferenceId } },
      include: PURCHASE_INCLUDE,
    });
    if (!purchase) throw new NotFoundException('أمر الشراء غير موجود');
    return purchase;
  }

  isDuplicateClientReference(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  /**
   * Atomic guarded status transition (docs/PURCHASING.md "Concurrency") -
   * `UPDATE ... WHERE status = 'ordered'` only lets ONE concurrent caller
   * win; the loser's zero-row result throws ConflictException before ever
   * touching inventory or accounting. Same family of pattern as
   * InventoryService.recordMovement's guarded UPDATE.
   */
  async receivePurchase(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    id: string,
  ) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.PURCHASES_CREATE,
    );
    const purchase = await tx.purchase.findFirst({
      where: { id, companyId },
      include: { items: true },
    });
    if (!purchase) throw new NotFoundException('أمر الشراء غير موجود');
    if (!scope.allBranches && !scope.branchIds.has(purchase.branchId)) {
      throw new ForbiddenException('أمر الشراء هذا خارج نطاق الفروع المصرح بها لهذه العضوية');
    }

    const updated = await tx.$queryRaw<{ id: string }[]>`
      UPDATE purchases
      SET status = 'received', received_at = now()
      WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid AND status = 'ordered'
      RETURNING id
    `;
    if (updated.length === 0) {
      throw new ConflictException('لا يمكن استلام هذا أمر الشراء (مُستلَم أو ملغى بالفعل)');
    }

    for (const item of purchase.items) {
      // The ONLY write path to stock_levels (docs/SECURITY.md "سلامة
      // التزامن") - unchanged from Phase 2/3. Milestone 6: each item's
      // recorded unitCost feeds the weighted-average cost basis atomically
      // in the same guarded UPDATE (docs/ACCOUNTING.md "COGS / Inventory
      // Valuation").
      await this.inventoryValuationService.recordReceipt(tx, companyId, {
        warehouseId: purchase.warehouseId,
        productId: item.productId,
        type: 'purchase',
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        referenceType: 'Purchase',
        referenceId: purchase.id,
        actorMembershipId: membershipId,
      });
    }

    const netCost = round2(Number(purchase.subtotal) - Number(purchase.discountAmount));
    const taxAmount = Number(purchase.taxAmount);
    await this.journalService.postJournalEntry(tx, companyId, {
      branchId: purchase.branchId,
      referenceType: 'Purchase',
      referenceId: purchase.id,
      description: `استلام شراء ${purchase.referenceNumber}`,
      actorMembershipId: membershipId,
      actorUserId,
      lines: [
        { accountCode: ACCOUNT_CODES.INVENTORY, debit: netCost },
        ...(taxAmount > 0 ? [{ accountCode: ACCOUNT_CODES.VAT_RECEIVABLE, debit: taxAmount }] : []),
        { accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE, credit: Number(purchase.totalAmount) },
      ],
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId: purchase.branchId,
      action: 'purchases.purchase.receive',
      entityType: 'Purchase',
      entityId: purchase.id,
      afterState: { referenceNumber: purchase.referenceNumber, totalAmount: purchase.totalAmount },
    });

    return this.getOwned(tx, companyId, purchase.id);
  }

  async cancelPurchase(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    id: string,
  ) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.PURCHASES_CANCEL,
    );
    const purchase = await tx.purchase.findFirst({ where: { id, companyId } });
    if (!purchase) throw new NotFoundException('أمر الشراء غير موجود');
    if (!scope.allBranches && !scope.branchIds.has(purchase.branchId)) {
      throw new ForbiddenException('أمر الشراء هذا خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    // Only 'ordered' purchases can be cancelled - once received, stock and
    // an Accounts Payable journal entry already exist; undoing that is a
    // return/void flow, not a simple cancel (docs/PURCHASING.md "Returns").
    if (purchase.status !== 'ordered') {
      throw new ConflictException('لا يمكن إلغاء أمر شراء تم استلامه أو إلغاؤه بالفعل');
    }

    await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId: purchase.branchId,
      action: 'purchases.purchase.cancel',
      entityType: 'Purchase',
      entityId: purchase.id,
    });

    return this.getOwned(tx, companyId, purchase.id);
  }

  async list(tx: TenantClient, companyId: string, membershipId: string, query: QueryPurchasesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.PURCHASES_READ,
    );

    const where: Prisma.PurchaseWhereInput = {
      companyId,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(!scope.allBranches ? { branchId: { in: Array.from(scope.branchIds) } } : {}),
    };

    const [data, total] = await Promise.all([
      tx.purchase.findMany({
        where,
        include: PURCHASE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.purchase.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async getOwned(tx: TenantClient, companyId: string, id: string, scope?: BranchScope) {
    const purchase = await tx.purchase.findFirst({
      where: { id, companyId },
      include: PURCHASE_INCLUDE,
    });
    if (!purchase) throw new NotFoundException('أمر الشراء غير موجود');
    if (scope && !scope.allBranches && !scope.branchIds.has(purchase.branchId)) {
      throw new ForbiddenException('أمر الشراء هذا خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    return purchase;
  }

  async getOwnedForMembership(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    id: string,
  ) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.PURCHASES_READ,
    );
    return this.getOwned(tx, companyId, id, scope);
  }
}
