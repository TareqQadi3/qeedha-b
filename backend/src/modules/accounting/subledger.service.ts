import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { round2 } from '../../common/utils/money';
import { BranchScope, BranchScopeService } from '../iam/branch-scope.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { AccountingService } from './accounting.service';
import { ACCOUNT_CODES } from './constants/default-chart-of-accounts';

function branchScopeWhere(scope: BranchScope): Prisma.JournalEntryWhereInput {
  return scope.allBranches
    ? {}
    : { OR: [{ branchId: null }, { branchId: { in: Array.from(scope.branchIds) } }] };
}

/**
 * AR/AP subledgers, derived live from the same JournalLine/JournalEntry
 * source as every other report (docs/ACCOUNTING.md "AR/AP subledger") -
 * never a separately maintained balance.
 *
 * AR note: Sales require full payment at completion (CreateSaleDto rejects
 * any payments total that doesn't equal the invoice total) - no credit-sale
 * flow exists anywhere in this codebase, so no JournalLine ever posts to the
 * Accounts Receivable account today. This method is real, generic
 * infrastructure against the ledger; it will correctly return an empty list
 * until a future milestone adds a deferred-payment sale capability. Not a
 * bug - see docs/ACCOUNTING.md "Known limitations".
 */
@Injectable()
export class SubledgerService {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly branchScopeService: BranchScopeService,
  ) {}

  async listCustomerBalances(tx: TenantClient, companyId: string, membershipId: string) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.ACCOUNTING_AR_VIEW,
    );
    const arAccount = await this.accountingService.getAccountByCode(
      tx,
      companyId,
      ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
    );

    const lines = await tx.journalLine.findMany({
      where: {
        companyId,
        accountId: arAccount.id,
        journalEntry: { status: 'posted', referenceType: 'Sale', ...branchScopeWhere(scope) },
      },
      select: { debit: true, credit: true, journalEntry: { select: { referenceId: true } } },
    });
    if (lines.length === 0) return [];

    const saleIds = Array.from(new Set(lines.map((l) => l.journalEntry.referenceId)));
    const sales = await tx.sale.findMany({
      where: { id: { in: saleIds }, companyId },
      select: { id: true, customerId: true },
    });
    const customerBySale = new Map(sales.map((s) => [s.id, s.customerId]));

    const balanceByCustomer = new Map<string, number>();
    for (const line of lines) {
      const customerId = customerBySale.get(line.journalEntry.referenceId);
      if (!customerId) continue;
      const delta = round2(Number(line.debit) - Number(line.credit));
      balanceByCustomer.set(customerId, round2((balanceByCustomer.get(customerId) ?? 0) + delta));
    }

    const customers = await tx.customer.findMany({
      where: { id: { in: Array.from(balanceByCustomer.keys()) }, companyId },
    });
    return customers
      .map((c) => ({
        customerId: c.id,
        customerName: c.name,
        balance: balanceByCustomer.get(c.id) ?? 0,
      }))
      .sort((a, b) => b.balance - a.balance);
  }

  async getCustomerStatement(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    customerId: string,
  ) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.ACCOUNTING_AR_VIEW,
    );
    const customer = await tx.customer.findFirst({ where: { id: customerId, companyId } });
    if (!customer) throw new NotFoundException('العميل غير موجود');

    const arAccount = await this.accountingService.getAccountByCode(
      tx,
      companyId,
      ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
    );
    const sales = await tx.sale.findMany({
      where: { companyId, customerId },
      select: { id: true },
    });
    const saleIds = sales.map((s) => s.id);

    const lines =
      saleIds.length === 0
        ? []
        : await tx.journalLine.findMany({
            where: {
              companyId,
              accountId: arAccount.id,
              journalEntry: {
                status: 'posted',
                referenceType: 'Sale',
                referenceId: { in: saleIds },
                ...branchScopeWhere(scope),
              },
            },
            include: { journalEntry: true },
            orderBy: { journalEntry: { postedAt: 'asc' } },
          });

    let running = 0;
    const transactions = lines.map((line) => {
      const debit = round2(Number(line.debit));
      const credit = round2(Number(line.credit));
      running = round2(running + debit - credit);
      return {
        date: line.journalEntry.postedAt,
        saleId: line.journalEntry.referenceId,
        description: line.description ?? line.journalEntry.description ?? null,
        debit,
        credit,
        runningBalance: running,
      };
    });

    return {
      customer: { id: customer.id, name: customer.name },
      transactions,
      balance: round2(running),
    };
  }

  async listSupplierBalances(tx: TenantClient, companyId: string, membershipId: string) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.ACCOUNTING_AP_VIEW,
    );
    const apAccount = await this.accountingService.getAccountByCode(
      tx,
      companyId,
      ACCOUNT_CODES.ACCOUNTS_PAYABLE,
    );

    const lines = await tx.journalLine.findMany({
      where: {
        companyId,
        accountId: apAccount.id,
        journalEntry: { status: 'posted', referenceType: 'Purchase', ...branchScopeWhere(scope) },
      },
      select: { debit: true, credit: true, journalEntry: { select: { referenceId: true } } },
    });
    if (lines.length === 0) return [];

    const purchaseIds = Array.from(new Set(lines.map((l) => l.journalEntry.referenceId)));
    const purchases = await tx.purchase.findMany({
      where: { id: { in: purchaseIds }, companyId },
      select: { id: true, supplierId: true },
    });
    const supplierByPurchase = new Map(purchases.map((p) => [p.id, p.supplierId]));

    const balanceBySupplier = new Map<string, number>();
    for (const line of lines) {
      const supplierId = supplierByPurchase.get(line.journalEntry.referenceId);
      if (!supplierId) continue;
      // AP is credit-normal - a positive balance means "we owe the supplier".
      const delta = round2(Number(line.credit) - Number(line.debit));
      balanceBySupplier.set(supplierId, round2((balanceBySupplier.get(supplierId) ?? 0) + delta));
    }

    const suppliers = await tx.supplier.findMany({
      where: { id: { in: Array.from(balanceBySupplier.keys()) }, companyId },
    });
    return suppliers
      .map((s) => ({
        supplierId: s.id,
        supplierName: s.name,
        balance: balanceBySupplier.get(s.id) ?? 0,
      }))
      .sort((a, b) => b.balance - a.balance);
  }

  async getSupplierStatement(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    supplierId: string,
  ) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.ACCOUNTING_AP_VIEW,
    );
    const supplier = await tx.supplier.findFirst({ where: { id: supplierId, companyId } });
    if (!supplier) throw new NotFoundException('المورد غير موجود');

    const apAccount = await this.accountingService.getAccountByCode(
      tx,
      companyId,
      ACCOUNT_CODES.ACCOUNTS_PAYABLE,
    );
    const purchases = await tx.purchase.findMany({
      where: { companyId, supplierId },
      select: { id: true },
    });
    const purchaseIds = purchases.map((p) => p.id);

    const lines =
      purchaseIds.length === 0
        ? []
        : await tx.journalLine.findMany({
            where: {
              companyId,
              accountId: apAccount.id,
              journalEntry: {
                status: 'posted',
                referenceType: 'Purchase',
                referenceId: { in: purchaseIds },
                ...branchScopeWhere(scope),
              },
            },
            include: { journalEntry: true },
            orderBy: { journalEntry: { postedAt: 'asc' } },
          });

    let running = 0;
    const transactions = lines.map((line) => {
      const debit = round2(Number(line.debit));
      const credit = round2(Number(line.credit));
      running = round2(running + credit - debit);
      return {
        date: line.journalEntry.postedAt,
        purchaseId: line.journalEntry.referenceId,
        description: line.description ?? line.journalEntry.description ?? null,
        debit,
        credit,
        runningBalance: running,
      };
    });

    return {
      supplier: { id: supplier.id, name: supplier.name },
      transactions,
      balance: round2(running),
    };
  }
}
