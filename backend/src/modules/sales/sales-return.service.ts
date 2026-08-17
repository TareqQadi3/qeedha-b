import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { round2 } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_CODES } from '../accounting/constants/default-chart-of-accounts';
import { JournalLineInput, JournalService } from '../accounting/journal.service';
import { BranchScopeService } from '../iam/branch-scope.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { InventoryValuationService } from '../inventory/inventory-valuation.service';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';

/** cash -> Cash account, everything else -> Bank account - same mapping SalesService uses. */
function cashOrBankAccountCode(method: string): string {
  return method === 'cash' ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
}

const SALE_RETURN_INCLUDE = {
  items: true,
} satisfies Prisma.SaleReturnInclude;

/**
 * Milestone 7 (docs/ACCOUNTING.md "Sales Returns"): a genuine partial/full
 * return of previously sold items - NOT a rename of SalesService.cancelSale
 * (which remains the full-sale void path, unchanged). A return:
 *   - reverses revenue/VAT for only the returned quantity/lines
 *   - restores inventory at the ORIGINAL sale-time cost (SaleItem.unitCost),
 *     never at whatever the current average cost happens to be
 *   - reverses the corresponding COGS at that same original cost
 *   - refunds AR first (up to the sale's current outstanding balance), then
 *     the remainder to the sale's original payment method (docs/ACCOUNTING.md
 *     "Sales Returns" "Refund allocation" - a documented policy, not an
 *     invented business flow)
 * Supports partial, full, and MULTIPLE returns against the same sale -
 * cumulative returned quantity per line is validated against a per-line
 * `SELECT ... FOR UPDATE` lock, the same concurrency pattern used everywhere
 * else in this codebase for "don't let two concurrent requests jointly
 * exceed a limit neither alone would".
 */
@Injectable()
export class SalesReturnService {
  constructor(
    private readonly auditService: AuditService,
    private readonly branchScopeService: BranchScopeService,
    private readonly inventoryValuationService: InventoryValuationService,
    private readonly journalService: JournalService,
  ) {}

  async createReturn(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    saleId: string,
    dto: CreateSaleReturnDto,
  ) {
    const existing = await tx.saleReturn.findUnique({
      where: {
        companyId_clientReferenceId: { companyId, clientReferenceId: dto.clientReferenceId },
      },
      include: SALE_RETURN_INCLUDE,
    });
    if (existing) {
      if (existing.saleId !== saleId) {
        throw new ConflictException('مفتاح الطلب هذا مستخدم بالفعل لعملية بيع مختلفة');
      }
      return existing;
    }

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.SALES_RETURN,
    );
    const sale = await tx.sale.findFirst({ where: { id: saleId, companyId } });
    if (!sale) throw new NotFoundException('عملية البيع غير موجودة');
    if (!scope.allBranches && !scope.branchIds.has(sale.branchId)) {
      throw new ForbiddenException('عملية البيع هذه خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    if (sale.status !== 'completed') {
      throw new ConflictException('لا يمكن تسجيل مرتجع على عملية بيع ملغاة');
    }

    let returnSubtotal = 0;
    let returnTax = 0;
    let totalCogs = 0;
    const itemsToCreate: {
      saleItemId: string;
      productId: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      unitCost: number | null;
      lineSubtotal: number;
      lineTax: number;
      lineTotal: number;
    }[] = [];

    for (const requested of dto.items) {
      // Row lock, held for the rest of this transaction - serializes
      // concurrent returns against the SAME sale item so cumulative
      // validation below can never be raced.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM sale_items
        WHERE id = ${requested.saleItemId}::uuid AND company_id = ${companyId}::uuid AND sale_id = ${sale.id}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new NotFoundException(`سطر البيع غير موجود ضمن هذه العملية: ${requested.saleItemId}`);
      }
      const saleItem = await tx.saleItem.findFirstOrThrow({
        where: { id: requested.saleItemId, companyId },
      });

      const alreadyReturnedAgg = await tx.saleReturnItem.aggregate({
        where: { companyId, saleItemId: saleItem.id },
        _sum: { quantity: true },
      });
      const alreadyReturned = Number(alreadyReturnedAgg._sum.quantity ?? 0);
      const soldQuantity = saleItem.quantity.toNumber();
      const remaining = round2(soldQuantity - alreadyReturned);
      if (requested.quantity > remaining + 0.0005) {
        throw new BadRequestException(
          `الكمية المطلوب إرجاعها (${requested.quantity}) أكبر من المتاح للإرجاع (${remaining}) للمنتج ${saleItem.productName}`,
        );
      }

      // Proportional allocation of this line's already-computed
      // subtotal/tax (which already bakes in any per-line discount) across
      // the returned quantity - the fairest split available without
      // inventing a new pricing model, matching how the line was originally
      // priced as a whole.
      const perUnitSubtotal = saleItem.lineSubtotal.toNumber() / soldQuantity;
      const perUnitTax = saleItem.lineTax.toNumber() / soldQuantity;
      const lineSubtotal = round2(perUnitSubtotal * requested.quantity);
      const lineTax = round2(perUnitTax * requested.quantity);
      const lineTotal = round2(lineSubtotal + lineTax);

      // Milestone 6/7 (docs/ACCOUNTING.md "COGS / Inventory Valuation"
      // "Returns"): restore stock at the ORIGINAL sale-time cost when known.
      // For a legacy pre-Milestone-6 row (unitCost NULL), `recordReceipt`'s
      // own documented fallback (current average, else Product.costPrice)
      // applies - and since blending a value into itself is a no-op on a
      // weighted average, the averageCost IT returns is then exactly the
      // fallback cost used, safe to reuse for the COGS reversal below.
      const historicalUnitCost = saleItem.unitCost !== null ? saleItem.unitCost.toNumber() : null;
      const receipt = await this.inventoryValuationService.recordReceipt(tx, companyId, {
        warehouseId: sale.warehouseId,
        productId: saleItem.productId,
        type: 'return',
        quantity: requested.quantity,
        unitCost: historicalUnitCost ?? undefined,
        referenceType: 'Sale',
        referenceId: sale.id,
        actorMembershipId: membershipId,
        notes: `مرتجع مبيعات${dto.reason ? `: ${dto.reason}` : ''}`,
      });
      const costForCogs = historicalUnitCost ?? receipt.averageCost;
      const lineCogs = round2(costForCogs * requested.quantity);
      totalCogs = round2(totalCogs + lineCogs);

      returnSubtotal = round2(returnSubtotal + lineSubtotal);
      returnTax = round2(returnTax + lineTax);

      itemsToCreate.push({
        saleItemId: saleItem.id,
        productId: saleItem.productId,
        quantity: requested.quantity,
        unitPrice: saleItem.unitPrice.toNumber(),
        vatRate: saleItem.vatRate.toNumber(),
        unitCost: historicalUnitCost,
        lineSubtotal,
        lineTax,
        lineTotal,
      });
    }

    const returnTotal = round2(returnSubtotal + returnTax);
    if (returnTotal <= 0) {
      throw new BadRequestException('لا يمكن تسجيل مرتجع بقيمة صفرية أو سالبة');
    }

    const saleReturn = await tx.saleReturn.create({
      data: {
        companyId,
        branchId: sale.branchId,
        saleId: sale.id,
        reason: dto.reason,
        subtotal: returnSubtotal,
        taxAmount: returnTax,
        totalAmount: returnTotal,
        clientReferenceId: dto.clientReferenceId,
        actorMembershipId: membershipId,
        items: {
          create: itemsToCreate.map((item) => ({
            companyId,
            saleItemId: item.saleItemId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            unitCost: item.unitCost,
            lineSubtotal: item.lineSubtotal,
            lineTax: item.lineTax,
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: SALE_RETURN_INCLUDE,
    });

    // Refund allocation policy (docs/ACCOUNTING.md "Sales Returns" "Refund
    // allocation"): reduce AR first, up to this sale's CURRENT outstanding
    // balance; any remainder goes to the sale's first recorded payment
    // method (or Cash if the sale has no payments at all - a still-fully-
    // outstanding credit sale being returned before ever being paid).
    const paidAgg = await tx.payment.aggregate({
      where: { companyId, saleId: sale.id },
      _sum: { amount: true },
    });
    const alreadyPaid = Number(paidAgg._sum.amount ?? 0);
    const outstandingAR = Math.max(0, round2(Number(sale.totalAmount) - alreadyPaid));
    const refundToAR = Math.min(returnTotal, outstandingAR);
    const refundRemainder = round2(returnTotal - refundToAR);

    let refundMethod: string = 'cash';
    if (refundRemainder > 0) {
      const firstPayment = await tx.payment.findFirst({
        where: { companyId, saleId: sale.id },
        orderBy: { createdAt: 'asc' },
      });
      refundMethod = firstPayment?.method ?? 'cash';
    }

    const lines: JournalLineInput[] = [];
    if (returnSubtotal > 0) {
      lines.push({ accountCode: ACCOUNT_CODES.SALES_RETURNS, debit: returnSubtotal });
    }
    if (returnTax > 0) {
      lines.push({ accountCode: ACCOUNT_CODES.VAT_PAYABLE, debit: returnTax });
    }
    if (refundToAR > 0) {
      lines.push({ accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, credit: refundToAR });
    }
    if (refundRemainder > 0) {
      lines.push({ accountCode: cashOrBankAccountCode(refundMethod), credit: refundRemainder });
    }
    if (totalCogs > 0) {
      lines.push({ accountCode: ACCOUNT_CODES.INVENTORY, debit: totalCogs });
      lines.push({ accountCode: ACCOUNT_CODES.COST_OF_GOODS_SOLD, credit: totalCogs });
    }

    await this.journalService.postJournalEntry(tx, companyId, {
      branchId: sale.branchId,
      referenceType: 'Sale',
      referenceId: sale.id,
      description: `مرتجع مبيعات${dto.reason ? `: ${dto.reason}` : ''}`,
      actorMembershipId: membershipId,
      actorUserId,
      lines,
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId: sale.branchId,
      action: 'sales.return.create',
      entityType: 'SaleReturn',
      entityId: saleReturn.id,
      afterState: {
        saleId: sale.id,
        totalAmount: returnTotal,
        totalCogs,
        refundToAR,
        refundRemainder,
        refundMethod: refundRemainder > 0 ? refundMethod : undefined,
        itemCount: itemsToCreate.length,
      },
    });

    return saleReturn;
  }

  async list(tx: TenantClient, companyId: string, membershipId: string, saleId?: string) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.SALES_READ,
    );
    return tx.saleReturn.findMany({
      where: {
        companyId,
        ...(saleId ? { saleId } : {}),
        ...(!scope.allBranches ? { branchId: { in: Array.from(scope.branchIds) } } : {}),
      },
      include: SALE_RETURN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }
}
