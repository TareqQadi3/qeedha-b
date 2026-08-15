import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { AuditService } from '../audit/audit.service';
import { BranchScope, BranchScopeService } from '../iam/branch-scope.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { InventoryService } from '../inventory/inventory.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySalesDto } from './dto/query-sales.dto';
import { InvoiceNumberService } from './invoice-number.service';

const SALE_INCLUDE = {
  items: true,
  payments: true,
  invoice: true,
  customer: true,
} satisfies Prisma.SaleInclude;

/** Cents-safe rounding for money computed from floats - avoids 39.999999999996-style artifacts before writing to a Decimal(14,2) column. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly auditService: AuditService,
    private readonly branchScopeService: BranchScopeService,
    private readonly inventoryService: InventoryService,
    private readonly invoiceNumberService: InvoiceNumberService,
  ) {}

  /**
   * True end-to-end transaction boundary (docs/SALES.md "Transaction
   * boundary"): validate branch/warehouse/POS-device/customer/product
   * ownership -> compute totals -> Sale -> SaleItems -> stock deduction
   * (the ONLY write path, InventoryService.recordMovement, same guarded
   * atomic UPDATE proven in Phase 2) -> Payments -> Invoice number ->
   * Invoice -> Audit, all inside the one `tx` the caller's withTenant()
   * transaction provides. Any failure (insufficient stock, invalid
   * reference, payment mismatch) throws and the whole transaction rolls
   * back - there is no code path that can leave a completed Sale with a
   * failed stock deduction, or a deducted stock with no Sale.
   *
   * Idempotency (docs/SALES.md): the fast path below returns the existing
   * Sale immediately if `clientReferenceId` was already used. The
   * TRUE-concurrent race (two identical requests reach this method before
   * either has committed) is handled one layer up, in SalesController,
   * which catches the unique constraint violation this method's `tx.sale.create`
   * throws in that case and re-fetches instead of erroring.
   */
  async createSale(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    dto: CreateSaleDto,
  ) {
    const existing = await tx.sale.findUnique({
      where: {
        companyId_clientReferenceId: { companyId, clientReferenceId: dto.clientReferenceId },
      },
      include: SALE_INCLUDE,
    });
    if (existing) return existing;

    const warehouse = await tx.warehouse.findFirst({
      where: { id: dto.warehouseId, companyId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('المستودع غير موجود');

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.SALES_CREATE,
    );
    this.branchScopeService.assertBranchInScope(scope, warehouse.branchId);

    let posDeviceId: string | null = null;
    if (dto.posDeviceId) {
      const posDevice = await tx.posDevice.findFirst({
        where: { id: dto.posDeviceId, companyId, deletedAt: null },
      });
      if (!posDevice) throw new NotFoundException('جهاز نقطة البيع غير موجود');
      if (posDevice.status !== 'active') {
        throw new ConflictException('جهاز نقطة البيع غير نشط');
      }
      if (posDevice.branchId !== warehouse.branchId) {
        throw new ConflictException('جهاز نقطة البيع تابع لفرع مختلف عن المستودع المحدد');
      }
      posDeviceId = posDevice.id;
    }

    let customerId: string | null = null;
    if (dto.customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: dto.customerId, companyId, deletedAt: null },
      });
      if (!customer) throw new NotFoundException('العميل غير موجود');
      customerId = customer.id;
    }

    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    const lineData: {
      productId: string;
      productName: string;
      productSku: string;
      unitPrice: number;
      vatRate: number;
      quantity: number;
      discountAmount: number;
      lineSubtotal: number;
      lineTax: number;
      lineTotal: number;
    }[] = [];

    for (const item of dto.items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, companyId, deletedAt: null },
      });
      if (!product) throw new NotFoundException(`المنتج غير موجود: ${item.productId}`);
      if (!product.isActive) throw new ConflictException(`المنتج معطّل: ${product.name}`);

      const unitPrice = Number(product.sellingPrice);
      const vatRate = Number(product.vatRate);
      const lineGross = round2(unitPrice * item.quantity);
      const discountAmount = item.discountAmount ?? 0;
      if (discountAmount > lineGross) {
        throw new BadRequestException(`قيمة الخصم أكبر من قيمة السطر: ${product.name}`);
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
        unitPrice,
        vatRate,
        quantity: item.quantity,
        discountAmount,
        lineSubtotal,
        lineTax,
        lineTotal,
      });
    }

    const totalAmount = round2(subtotal - discountTotal + taxTotal);
    const paymentsSum = round2(dto.payments.reduce((sum, p) => sum + p.amount, 0));
    if (Math.round(paymentsSum * 100) !== Math.round(totalAmount * 100)) {
      throw new BadRequestException(
        `مجموع الدفعات (${paymentsSum}) لا يساوي إجمالي الفاتورة (${totalAmount})`,
      );
    }

    const sale = await tx.sale.create({
      data: {
        companyId,
        branchId: warehouse.branchId,
        warehouseId: warehouse.id,
        posDeviceId,
        customerId,
        currency: 'SAR',
        subtotal,
        discountAmount: discountTotal,
        taxAmount: taxTotal,
        totalAmount,
        clientReferenceId: dto.clientReferenceId,
        actorMembershipId: membershipId,
      },
    });

    for (const line of lineData) {
      await tx.saleItem.create({
        data: {
          companyId,
          saleId: sale.id,
          productId: line.productId,
          productName: line.productName,
          productSku: line.productSku,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
          quantity: line.quantity,
          discountAmount: line.discountAmount,
          lineSubtotal: line.lineSubtotal,
          lineTax: line.lineTax,
          lineTotal: line.lineTotal,
        },
      });

      // The ONLY write path to stock_levels (docs/SECURITY.md "سلامة
      // التزامن") - throws ConflictException if this would drive stock
      // negative, which rolls back the entire sale transaction.
      await this.inventoryService.recordMovement(tx, companyId, {
        warehouseId: warehouse.id,
        productId: line.productId,
        type: 'sale',
        quantity: -line.quantity,
        referenceType: 'Sale',
        referenceId: sale.id,
        actorMembershipId: membershipId,
      });
    }

    for (const payment of dto.payments) {
      await tx.payment.create({
        data: {
          companyId,
          saleId: sale.id,
          method: payment.method,
          status: 'success',
          amount: payment.amount,
          currency: 'SAR',
          actorMembershipId: membershipId,
        },
      });
    }

    const invoiceNumber = await this.invoiceNumberService.issueNext(tx, companyId);
    await tx.invoice.create({
      data: {
        companyId,
        branchId: warehouse.branchId,
        saleId: sale.id,
        customerId,
        invoiceNumber,
        currency: 'SAR',
        subtotal,
        discountAmount: discountTotal,
        taxAmount: taxTotal,
        totalAmount,
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId: warehouse.branchId,
      action: 'sales.sale.complete',
      entityType: 'Sale',
      entityId: sale.id,
      afterState: {
        totalAmount,
        itemCount: lineData.length,
        paymentMethods: dto.payments.map((p) => p.method),
        invoiceNumber,
        customerId,
      },
    });

    return this.getOwned(tx, companyId, sale.id);
  }

  /** Used by SalesController's fallback path after a caught unique-constraint race on clientReferenceId. */
  async getByClientReference(tx: TenantClient, companyId: string, clientReferenceId: string) {
    const sale = await tx.sale.findUnique({
      where: { companyId_clientReferenceId: { companyId, clientReferenceId } },
      include: SALE_INCLUDE,
    });
    if (!sale) throw new NotFoundException('عملية البيع غير موجودة');
    return sale;
  }

  /**
   * P2002's `meta.target` shape is driver-dependent (an array of column
   * names on some databases, the raw Postgres constraint name as a string
   * on others, sometimes absent inside a transaction) - not reliable to
   * pattern-match. Not needed here anyway: `tx.sale.create` above is the
   * only write in `createSale` capable of throwing P2002 on the `sales`
   * table (`id` is a UUID default, which practically never collides), so
   * any P2002 reaching this catch is the clientReferenceId race.
   */
  isDuplicateClientReference(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  async list(tx: TenantClient, companyId: string, membershipId: string, query: QuerySalesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.SALES_READ,
    );

    const where: Prisma.SaleWhereInput = {
      companyId,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(!scope.allBranches ? { branchId: { in: Array.from(scope.branchIds) } } : {}),
    };

    const [data, total] = await Promise.all([
      tx.sale.findMany({
        where,
        include: SALE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.sale.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async getOwned(tx: TenantClient, companyId: string, id: string, scope?: BranchScope) {
    const sale = await tx.sale.findFirst({ where: { id, companyId }, include: SALE_INCLUDE });
    if (!sale) throw new NotFoundException('عملية البيع غير موجودة');
    if (scope && !scope.allBranches && !scope.branchIds.has(sale.branchId)) {
      throw new ForbiddenException('عملية البيع هذه خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    return sale;
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
      PERMISSION_KEYS.SALES_READ,
    );
    return this.getOwned(tx, companyId, id, scope);
  }

  /**
   * Minimal full-sale void (docs/SALES.md "Cancel/void") - not a partial
   * returns system. Reverses every line's stock via a `return` movement
   * (existing StockMovementType, unchanged since Phase 2) and marks the
   * Sale and its Invoice cancelled. Kept extensible for a future
   * line-level returns system rather than blocking it, per the Phase 3
   * brief - see docs/SALES.md "Deferred: partial returns".
   */
  async cancelSale(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    id: string,
  ) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.SALES_CANCEL,
    );
    const sale = await tx.sale.findFirst({
      where: { id, companyId },
      include: { items: true, invoice: true },
    });
    if (!sale) throw new NotFoundException('عملية البيع غير موجودة');
    if (!scope.allBranches && !scope.branchIds.has(sale.branchId)) {
      throw new ForbiddenException('عملية البيع هذه خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    if (sale.status !== 'completed') {
      throw new ConflictException('عملية البيع ملغاة بالفعل');
    }

    for (const item of sale.items) {
      await this.inventoryService.recordMovement(tx, companyId, {
        warehouseId: sale.warehouseId,
        productId: item.productId,
        type: 'return',
        quantity: Number(item.quantity),
        referenceType: 'Sale',
        referenceId: sale.id,
        actorMembershipId: membershipId,
        notes: 'إلغاء عملية بيع',
      });
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    if (sale.invoice) {
      await tx.invoice.update({
        where: { id: sale.invoice.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
    }

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId: sale.branchId,
      action: 'sales.sale.cancel',
      entityType: 'Sale',
      entityId: sale.id,
      beforeState: { status: sale.status },
      afterState: { status: 'cancelled' },
    });

    return this.getOwned(tx, companyId, sale.id);
  }
}
