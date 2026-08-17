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
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';

const PURCHASE_RETURN_INCLUDE = {
  items: true,
} satisfies Prisma.PurchaseReturnInclude;

/**
 * Milestone 7 (docs/ACCOUNTING.md "Purchase Returns"): a genuine
 * partial/full return of previously RECEIVED purchase items to a supplier -
 * does NOT mutate the original Purchase record (a separate transactional
 * record, per docs/ACCOUNTING.md "Do not silently modify the original
 * purchase receipt"). Simpler than SalesReturnService: no split-tender
 * refund logic, since a Purchase never supports partial payment at creation
 * the way a Sale does - the entire return value always hits Accounts
 * Payable, which is allowed to go negative (a debit/receivable balance) if
 * the return exceeds what is currently owed, same as any account in this
 * system's generic dual-direction balance reporting.
 *
 * Inventory reduction uses each PurchaseItem's ORIGINAL unitCost (not the
 * current, possibly since-drifted average cost) - the same "reuse the
 * already-captured historical cost, don't invent a new costing method"
 * policy SalesReturnService applies with SaleItem.unitCost, kept symmetric
 * here since PurchaseItem.unitCost is always known (never NULL, unlike the
 * sales side's legacy-row case). This keeps the AP debit and Inventory
 * credit exactly matched without a variance/plug account - see
 * docs/ACCOUNTING.md "Purchase Returns" for why a plug account was decided
 * against as a disproportionate addition for this product's scope.
 */
@Injectable()
export class PurchaseReturnService {
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
    purchaseId: string,
    dto: CreatePurchaseReturnDto,
  ) {
    const existing = await tx.purchaseReturn.findUnique({
      where: {
        companyId_clientReferenceId: { companyId, clientReferenceId: dto.clientReferenceId },
      },
      include: PURCHASE_RETURN_INCLUDE,
    });
    if (existing) {
      if (existing.purchaseId !== purchaseId) {
        throw new ConflictException('مفتاح الطلب هذا مستخدم بالفعل لأمر شراء مختلف');
      }
      return existing;
    }

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.PURCHASES_RETURN,
    );
    const purchase = await tx.purchase.findFirst({ where: { id: purchaseId, companyId } });
    if (!purchase) throw new NotFoundException('أمر الشراء غير موجود');
    if (!scope.allBranches && !scope.branchIds.has(purchase.branchId)) {
      throw new ForbiddenException('أمر الشراء هذا خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    if (purchase.status !== 'received') {
      throw new ConflictException('لا يمكن تسجيل مرتجع إلا على أمر شراء تم استلامه');
    }

    let returnSubtotal = 0;
    let returnTax = 0;
    const itemsToCreate: {
      purchaseItemId: string;
      productId: string;
      quantity: number;
      unitCost: number;
      vatRate: number;
      lineSubtotal: number;
      lineTax: number;
      lineTotal: number;
    }[] = [];

    for (const requested of dto.items) {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM purchase_items
        WHERE id = ${requested.purchaseItemId}::uuid AND company_id = ${companyId}::uuid AND purchase_id = ${purchase.id}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new NotFoundException(
          `سطر الشراء غير موجود ضمن هذا الأمر: ${requested.purchaseItemId}`,
        );
      }
      const purchaseItem = await tx.purchaseItem.findFirstOrThrow({
        where: { id: requested.purchaseItemId, companyId },
      });

      const alreadyReturnedAgg = await tx.purchaseReturnItem.aggregate({
        where: { companyId, purchaseItemId: purchaseItem.id },
        _sum: { quantity: true },
      });
      const alreadyReturned = Number(alreadyReturnedAgg._sum.quantity ?? 0);
      const receivedQuantity = purchaseItem.quantity.toNumber();
      const remaining = round2(receivedQuantity - alreadyReturned);
      if (requested.quantity > remaining + 0.0005) {
        throw new BadRequestException(
          `الكمية المطلوب إرجاعها (${requested.quantity}) أكبر من المتاح للإرجاع (${remaining}) للمنتج ${purchaseItem.productName}`,
        );
      }

      const perUnitSubtotal = purchaseItem.lineSubtotal.toNumber() / receivedQuantity;
      const perUnitTax = purchaseItem.lineTax.toNumber() / receivedQuantity;
      const lineSubtotal = round2(perUnitSubtotal * requested.quantity);
      const lineTax = round2(perUnitTax * requested.quantity);
      const lineTotal = round2(lineSubtotal + lineTax);

      // Outgoing movement - never touches average_cost (weighted-average
      // rule: only incoming movements recompute it), only quantity. Fails
      // with ConflictException if fewer units remain on hand than requested
      // (e.g. some were already sold) - a correct, not-invented guard.
      await this.inventoryValuationService.recordIssue(tx, companyId, {
        warehouseId: purchase.warehouseId,
        productId: purchaseItem.productId,
        type: 'return',
        quantity: requested.quantity,
        referenceType: 'Purchase',
        referenceId: purchase.id,
        actorMembershipId: membershipId,
        notes: `مرتجع مشتريات${dto.reason ? `: ${dto.reason}` : ''}`,
      });

      returnSubtotal = round2(returnSubtotal + lineSubtotal);
      returnTax = round2(returnTax + lineTax);

      itemsToCreate.push({
        purchaseItemId: purchaseItem.id,
        productId: purchaseItem.productId,
        quantity: requested.quantity,
        unitCost: purchaseItem.unitCost.toNumber(),
        vatRate: purchaseItem.vatRate.toNumber(),
        lineSubtotal,
        lineTax,
        lineTotal,
      });
    }

    const returnTotal = round2(returnSubtotal + returnTax);
    if (returnTotal <= 0) {
      throw new BadRequestException('لا يمكن تسجيل مرتجع بقيمة صفرية أو سالبة');
    }

    const purchaseReturn = await tx.purchaseReturn.create({
      data: {
        companyId,
        branchId: purchase.branchId,
        purchaseId: purchase.id,
        reason: dto.reason,
        subtotal: returnSubtotal,
        taxAmount: returnTax,
        totalAmount: returnTotal,
        clientReferenceId: dto.clientReferenceId,
        actorMembershipId: membershipId,
        items: {
          create: itemsToCreate.map((item) => ({
            companyId,
            purchaseItemId: item.purchaseItemId,
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            vatRate: item.vatRate,
            lineSubtotal: item.lineSubtotal,
            lineTax: item.lineTax,
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: PURCHASE_RETURN_INCLUDE,
    });

    // Dr AP (returnTotal) / Cr Inventory (returnSubtotal) / Cr VAT_RECEIVABLE
    // (returnTax, if any) - see docs/ACCOUNTING.md "Purchase Returns". No
    // Purchase Returns P&L account: purchases debit Inventory directly
    // (perpetual method), so the symmetric reversal is a straight credit
    // back to Inventory/VAT_RECEIVABLE, not a contra-revenue-style account.
    const lines: JournalLineInput[] = [
      { accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE, debit: returnTotal },
      { accountCode: ACCOUNT_CODES.INVENTORY, credit: returnSubtotal },
    ];
    if (returnTax > 0) {
      lines.push({ accountCode: ACCOUNT_CODES.VAT_RECEIVABLE, credit: returnTax });
    }

    await this.journalService.postJournalEntry(tx, companyId, {
      branchId: purchase.branchId,
      referenceType: 'Purchase',
      referenceId: purchase.id,
      description: `مرتجع مشتريات${dto.reason ? `: ${dto.reason}` : ''}`,
      actorMembershipId: membershipId,
      actorUserId,
      lines,
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId: purchase.branchId,
      action: 'purchases.return.create',
      entityType: 'PurchaseReturn',
      entityId: purchaseReturn.id,
      afterState: {
        purchaseId: purchase.id,
        totalAmount: returnTotal,
        itemCount: itemsToCreate.length,
      },
    });

    return purchaseReturn;
  }

  async list(tx: TenantClient, companyId: string, membershipId: string, purchaseId?: string) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.PURCHASES_READ,
    );
    return tx.purchaseReturn.findMany({
      where: {
        companyId,
        ...(purchaseId ? { purchaseId } : {}),
        ...(!scope.allBranches ? { branchId: { in: Array.from(scope.branchIds) } } : {}),
      },
      include: PURCHASE_RETURN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }
}
