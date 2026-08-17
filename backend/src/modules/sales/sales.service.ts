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
import { round2 } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_CODES } from '../accounting/constants/default-chart-of-accounts';
import { JournalLineInput, JournalService } from '../accounting/journal.service';
import { EInvoiceService } from '../einvoice/einvoice.service';
import { BranchScope, BranchScopeService } from '../iam/branch-scope.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { InventoryValuationService } from '../inventory/inventory-valuation.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySalesDto } from './dto/query-sales.dto';
import { RecordSalePaymentDto } from './dto/record-sale-payment.dto';
import { InvoiceNumberService } from './invoice-number.service';

/** cash -> Cash account, everything else (card/transfer/other) -> Bank account - see docs/PAYMENTS.md and docs/ACCOUNTING.md "Account Mapping". */
function cashOrBankAccountCode(method: string): string {
  return method === 'cash' ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
}

const SALE_INCLUDE = {
  items: true,
  payments: true,
  invoice: true,
  customer: true,
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly auditService: AuditService,
    private readonly branchScopeService: BranchScopeService,
    private readonly inventoryValuationService: InventoryValuationService,
    private readonly invoiceNumberService: InvoiceNumberService,
    private readonly journalService: JournalService,
    private readonly einvoiceService: EInvoiceService,
    private readonly subscriptionService: SubscriptionService,
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

    // Milestone 8: usage limit (plan.maxMonthlySales) - checked on the
    // genuinely-new-sale path only, so a retried/duplicate clientReferenceId
    // request (caught above) never gets double-counted against the limit.
    await this.subscriptionService.assertWithinLimit(tx, companyId, 'monthlySales');

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
    // Milestone 7 (docs/ACCOUNTING.md "Customer Credit Sales / AR"): a sale
    // may now be fully paid, partially paid, or fully unpaid (credit) - the
    // only rule enforced here is that payments can never EXCEED the total
    // (overpayment at sale-creation time is always a client error, never a
    // legitimate "advance" - an advance would need its own concept, out of
    // scope here). A positive AR remainder always requires a customer, since
    // AR is a per-customer receivable, not an anonymous balance.
    if (Math.round(paymentsSum * 100) > Math.round(totalAmount * 100)) {
      throw new BadRequestException(
        `مجموع الدفعات (${paymentsSum}) أكبر من إجمالي الفاتورة (${totalAmount})`,
      );
    }
    const arRemainder = round2(totalAmount - paymentsSum);
    if (arRemainder > 0 && !customerId) {
      throw new BadRequestException('البيع الآجل (غير مسدد بالكامل) يتطلب تحديد عميل');
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

    let totalCogs = 0;
    for (const line of lineData) {
      // The ONLY write path to stock_levels (docs/SECURITY.md "سلامة
      // التزامن") - throws ConflictException if this would drive stock
      // negative, which rolls back the entire sale transaction. Milestone 6
      // (docs/ACCOUNTING.md "COGS / Inventory Valuation"): this ALSO returns
      // the weighted-average cost in effect for this line, atomically with
      // the stock deduction - the same number is stored on the SaleItem
      // (for a future return/cancel to reproduce) and summed into the
      // Dr COGS / Cr Inventory journal line below.
      const issue = await this.inventoryValuationService.recordIssue(tx, companyId, {
        warehouseId: warehouse.id,
        productId: line.productId,
        type: 'sale',
        quantity: line.quantity,
        referenceType: 'Sale',
        referenceId: sale.id,
        actorMembershipId: membershipId,
      });
      totalCogs = round2(totalCogs + issue.cogsAmount);

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
          unitCost: issue.averageCost,
        },
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
    const invoice = await tx.invoice.create({
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

    // ZATCA e-invoicing readiness (Milestone 4, Phase 1 only - see
    // docs/ZATCA.md): SalesService knows nothing about QR/TLV/compliance
    // status beyond this one call - see EInvoiceService.
    await this.einvoiceService.generateForInvoice(tx, companyId, actorUserId, invoice);

    // Dr Cash/Bank (per payment) / Cr Sales Revenue (net of discount) / Cr
    // VAT Payable / Dr COGS / Cr Inventory (Milestone 6, docs/ACCOUNTING.md
    // "COGS / Inventory Valuation") - the COGS amount is the SUM of what
    // inventoryValuationService.recordIssue already computed and wrote per
    // line above, never recomputed here from a client-supplied or
    // Product.costPrice value.
    const revenueNet = round2(subtotal - discountTotal);
    const journalLines: JournalLineInput[] = dto.payments.map((payment) => ({
      accountCode: cashOrBankAccountCode(payment.method),
      debit: payment.amount,
    }));
    // Milestone 7 (docs/ACCOUNTING.md "Customer Credit Sales / AR"): the
    // unpaid remainder (if any) is Dr'd to Accounts Receivable, same journal
    // entry as the paid portion - a partially-paid sale posts BOTH a
    // Cash/Bank line (for what was paid) and an AR line (for what wasn't),
    // summing to the same totalAmount either way.
    if (arRemainder > 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, debit: arRemainder });
    }
    journalLines.push({ accountCode: ACCOUNT_CODES.SALES_REVENUE, credit: revenueNet });
    if (taxTotal > 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.VAT_PAYABLE, credit: taxTotal });
    }
    if (totalCogs > 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.COST_OF_GOODS_SOLD, debit: totalCogs });
      journalLines.push({ accountCode: ACCOUNT_CODES.INVENTORY, credit: totalCogs });
    }
    await this.journalService.postJournalEntry(tx, companyId, {
      branchId: warehouse.branchId,
      referenceType: 'Sale',
      referenceId: sale.id,
      description: `بيع ${invoiceNumber}`,
      actorMembershipId: membershipId,
      actorUserId,
      lines: journalLines,
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
        totalCogs,
        paymentMethods: dto.payments.map((p) => p.method),
        invoiceNumber,
        customerId,
      },
    });

    return this.getOwned(tx, companyId, sale.id);
  }

  /**
   * Milestone 7 (docs/ACCOUNTING.md "Customer Credit Sales / AR"): records a
   * standalone payment against an existing sale's outstanding AR balance -
   * `Dr Cash/Bank / Cr Accounts Receivable`. The AR balance itself is never
   * stored - it is always (sale.totalAmount - SUM(existing Payment.amount)),
   * recomputed here under a row lock (docs/SECURITY.md "سلامة التزامن"),
   * the same pattern as InventoryService.recordMovement's guarded UPDATE:
   * `SELECT ... FOR UPDATE` on the sale row serializes concurrent payment
   * attempts against it, so two simultaneous payments can never together
   * overpay a balance neither alone would exceed.
   */
  async recordPayment(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    saleId: string,
    dto: RecordSalePaymentDto,
  ) {
    const existingPayment = await tx.payment.findUnique({
      where: {
        companyId_clientReferenceId: { companyId, clientReferenceId: dto.clientReferenceId },
      },
    });
    if (existingPayment) {
      if (existingPayment.saleId !== saleId) {
        throw new ConflictException('مفتاح الطلب هذا مستخدم بالفعل لعملية بيع مختلفة');
      }
      return this.getOwned(tx, companyId, saleId);
    }

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.SALES_PAYMENT_RECORD,
    );
    const sale = await tx.sale.findFirst({ where: { id: saleId, companyId } });
    if (!sale) throw new NotFoundException('عملية البيع غير موجودة');
    if (!scope.allBranches && !scope.branchIds.has(sale.branchId)) {
      throw new ForbiddenException('عملية البيع هذه خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    if (sale.status !== 'completed') {
      throw new ConflictException('لا يمكن تسجيل دفعة على عملية بيع ملغاة');
    }

    // Row lock held for the rest of this transaction - see doc comment above.
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
    const paidAgg = await tx.payment.aggregate({
      where: { companyId, saleId },
      _sum: { amount: true },
    });
    const alreadyPaid = Number(paidAgg._sum.amount ?? 0);
    const outstanding = round2(Number(sale.totalAmount) - alreadyPaid);
    if (dto.amount > outstanding + 0.005) {
      throw new ConflictException(
        `المبلغ المدفوع (${dto.amount}) أكبر من الرصيد المستحق (${outstanding})`,
      );
    }

    const payment = await tx.payment.create({
      data: {
        companyId,
        saleId,
        method: dto.method,
        status: 'success',
        amount: dto.amount,
        currency: sale.currency,
        clientReferenceId: dto.clientReferenceId,
        actorMembershipId: membershipId,
      },
    });

    await this.journalService.postJournalEntry(tx, companyId, {
      branchId: sale.branchId,
      referenceType: 'Sale',
      referenceId: sale.id,
      description: `دفعة على بيع آجل${dto.notes ? `: ${dto.notes}` : ''}`,
      actorMembershipId: membershipId,
      actorUserId,
      lines: [
        { accountCode: cashOrBankAccountCode(dto.method), debit: dto.amount },
        { accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, credit: dto.amount },
      ],
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId: sale.branchId,
      action: 'sales.payment.record',
      entityType: 'Payment',
      entityId: payment.id,
      afterState: {
        saleId,
        amount: dto.amount,
        method: dto.method,
        outstandingBefore: outstanding,
      },
    });

    return this.getOwned(tx, companyId, saleId);
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
      // Milestone 6 (docs/ACCOUNTING.md "COGS / Inventory Valuation"
      // "Returns"): returns stock at the SAME unit cost it left at
      // (item.unitCost, captured on the SaleItem at sale time), not
      // whatever the average happens to be now - otherwise a purchase at a
      // different price between the sale and its cancellation would corrupt
      // the average. `undefined` for a pre-Milestone-6 SaleItem (unitCost
      // was never captured, no COGS was ever posted for it) - the guarded
      // UPDATE then falls back to the current average cost, a documented,
      // value-neutral default (see recordMovement's SQL comment).
      await this.inventoryValuationService.recordReceipt(tx, companyId, {
        warehouseId: sale.warehouseId,
        productId: item.productId,
        type: 'return',
        quantity: Number(item.quantity),
        unitCost: item.unitCost !== null ? Number(item.unitCost) : undefined,
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

    // Never mutates/deletes the original posted entry - posts a new
    // reversing entry instead (docs/JOURNAL_ENTRIES.md "Posted vs
    // corrections"). The original entry always exists (every completed
    // sale posts one in createSale), so this is not conditional.
    const activeEntry = await tx.journalEntry.findFirst({
      where: { companyId, referenceType: 'Sale', referenceId: sale.id, status: 'posted' },
    });
    if (activeEntry) {
      await this.journalService.reverseJournalEntry(tx, companyId, {
        originalEntryId: activeEntry.id,
        referenceType: 'Sale',
        referenceId: sale.id,
        description: `عكس قيد بيع ملغى`,
        actorMembershipId: membershipId,
        actorUserId,
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
