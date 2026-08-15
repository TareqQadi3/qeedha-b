import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { round2 } from '../../common/utils/money';
import { BranchScope, BranchScopeService } from '../iam/branch-scope.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { QueryBalanceSheetDto } from './dto/query-balance-sheet.dto';
import { QueryDateRangeDto } from './dto/query-date-range.dto';
import { QueryGeneralLedgerDto } from './dto/query-general-ledger.dto';

function dayStart(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dayEnd(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function postedAtWhere(dateFrom?: string, dateTo?: string): Prisma.JournalEntryWhereInput {
  const from = dayStart(dateFrom);
  const to = dayEnd(dateTo);
  if (!from && !to) return {};
  return { postedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } };
}

function branchScopeWhere(scope: BranchScope): Prisma.JournalEntryWhereInput {
  return scope.allBranches
    ? {}
    : { OR: [{ branchId: null }, { branchId: { in: Array.from(scope.branchIds) } }] };
}

/** Hard cap for General Ledger lines per request - see the comment at the query site. */
export const MAX_LEDGER_LINES = 1000;

function isDebitNormal(type: AccountType): boolean {
  return type === 'asset' || type === 'expense';
}

/**
 * Shared query layer every accounting report reads through (docs/ACCOUNTING.md
 * "Reporting foundation") - all figures are derived live from posted
 * JournalLine/JournalEntry rows, never a separately-maintained running total,
 * so Trial Balance/GL/P&L/Balance Sheet can never drift from each other or
 * from the ledger.
 */
@Injectable()
export class AccountingReportsService {
  constructor(private readonly branchScopeService: BranchScopeService) {}

  private scopeFor(tx: TenantClient, membershipId: string) {
    return this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.ACCOUNTING_REPORTS_VIEW,
    );
  }

  async getTrialBalance(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    query: QueryDateRangeDto,
  ) {
    const scope = await this.scopeFor(tx, membershipId);

    const grouped = await tx.journalLine.groupBy({
      by: ['accountId'],
      where: {
        companyId,
        journalEntry: {
          status: 'posted',
          ...branchScopeWhere(scope),
          ...postedAtWhere(query.dateFrom, query.dateTo),
        },
      },
      _sum: { debit: true, credit: true },
    });

    const accounts = await tx.account.findMany({
      where: { id: { in: grouped.map((g) => g.accountId) } },
    });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const rows = grouped
      .map((g) => {
        const account = accountById.get(g.accountId)!;
        const totalDebit = round2(Number(g._sum.debit ?? 0));
        const totalCredit = round2(Number(g._sum.credit ?? 0));
        return {
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          accountType: account.type,
          totalDebit,
          totalCredit,
          netBalance: round2(totalDebit - totalCredit),
        };
      })
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const totalDebit = round2(rows.reduce((s, r) => s + r.totalDebit, 0));
    const totalCredit = round2(rows.reduce((s, r) => s + r.totalCredit, 0));

    return {
      rows,
      totals: {
        totalDebit,
        totalCredit,
        isBalanced: Math.round(totalDebit * 100) === Math.round(totalCredit * 100),
      },
      range: { dateFrom: query.dateFrom ?? null, dateTo: query.dateTo ?? null },
    };
  }

  async getGeneralLedger(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    query: QueryGeneralLedgerDto,
  ) {
    const scope = await this.scopeFor(tx, membershipId);
    const account = await tx.account.findFirst({ where: { id: query.accountId, companyId } });
    if (!account) throw new NotFoundException('الحساب غير موجود');

    const from = dayStart(query.dateFrom);
    const debitNormal = isDebitNormal(account.type);

    let openingBalance = 0;
    if (from) {
      const before = await tx.journalLine.aggregate({
        where: {
          companyId,
          accountId: account.id,
          journalEntry: { status: 'posted', ...branchScopeWhere(scope), postedAt: { lt: from } },
        },
        _sum: { debit: true, credit: true },
      });
      const debitSum = Number(before._sum.debit ?? 0);
      const creditSum = Number(before._sum.credit ?? 0);
      openingBalance = debitNormal ? debitSum - creditSum : creditSum - debitSum;
    }

    // Hard cap, not full pagination (Milestone 2 "Performance"): a ledger
    // view is read as one continuous statement, not paged like a list table
    // - narrowing dateFrom/dateTo is the intended way to see more than this
    // many lines, same as real accounting software. This only bounds the
    // query; it doesn't change the response shape or break any caller.
    const lines = await tx.journalLine.findMany({
      where: {
        companyId,
        accountId: account.id,
        journalEntry: {
          status: 'posted',
          ...branchScopeWhere(scope),
          ...postedAtWhere(query.dateFrom, query.dateTo),
        },
      },
      include: { journalEntry: true },
      orderBy: [{ journalEntry: { postedAt: 'asc' } }, { id: 'asc' }],
      take: MAX_LEDGER_LINES,
    });

    let running = round2(openingBalance);
    const rows = lines.map((line) => {
      const debit = round2(Number(line.debit));
      const credit = round2(Number(line.credit));
      const delta = debitNormal ? debit - credit : credit - debit;
      running = round2(running + delta);
      return {
        journalEntryId: line.journalEntryId,
        date: line.journalEntry.postedAt,
        referenceType: line.journalEntry.referenceType,
        referenceId: line.journalEntry.referenceId,
        description: line.description ?? line.journalEntry.description ?? null,
        debit,
        credit,
        runningBalance: running,
      };
    });

    return {
      account: { id: account.id, code: account.code, name: account.name, type: account.type },
      openingBalance: round2(openingBalance),
      closingBalance: running,
      lines: rows,
      range: { dateFrom: query.dateFrom ?? null, dateTo: query.dateTo ?? null },
    };
  }

  async getProfitAndLoss(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    query: QueryDateRangeDto,
  ) {
    const scope = await this.scopeFor(tx, membershipId);

    const grouped = await tx.journalLine.groupBy({
      by: ['accountId'],
      where: {
        companyId,
        account: { type: { in: ['revenue', 'expense'] } },
        journalEntry: {
          status: 'posted',
          ...branchScopeWhere(scope),
          ...postedAtWhere(query.dateFrom, query.dateTo),
        },
      },
      _sum: { debit: true, credit: true },
    });

    const accounts = await tx.account.findMany({
      where: { id: { in: grouped.map((g) => g.accountId) } },
    });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const revenue: {
      accountId: string;
      accountCode: string;
      accountName: string;
      amount: number;
    }[] = [];
    const expenses: typeof revenue = [];
    for (const g of grouped) {
      const account = accountById.get(g.accountId)!;
      const debit = round2(Number(g._sum.debit ?? 0));
      const credit = round2(Number(g._sum.credit ?? 0));
      const row = { accountId: account.id, accountCode: account.code, accountName: account.name };
      if (account.type === 'revenue') revenue.push({ ...row, amount: round2(credit - debit) });
      else expenses.push({ ...row, amount: round2(debit - credit) });
    }
    revenue.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    expenses.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const totalRevenue = round2(revenue.reduce((s, r) => s + r.amount, 0));
    const totalExpense = round2(expenses.reduce((s, r) => s + r.amount, 0));

    return {
      revenue,
      expenses,
      totalRevenue,
      totalExpense,
      netProfit: round2(totalRevenue - totalExpense),
      range: { dateFrom: query.dateFrom ?? null, dateTo: query.dateTo ?? null },
    };
  }

  async getBalanceSheet(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    query: QueryBalanceSheetDto,
  ) {
    const scope = await this.scopeFor(tx, membershipId);
    const asOfDate = query.asOfDate;

    const grouped = await tx.journalLine.groupBy({
      by: ['accountId'],
      where: {
        companyId,
        account: { type: { in: ['asset', 'liability', 'equity'] } },
        journalEntry: {
          status: 'posted',
          ...branchScopeWhere(scope),
          ...postedAtWhere(undefined, asOfDate),
        },
      },
      _sum: { debit: true, credit: true },
    });

    const accounts = await tx.account.findMany({
      where: { id: { in: grouped.map((g) => g.accountId) } },
    });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    type Row = {
      accountId: string | null;
      accountCode: string | null;
      accountName: string;
      balance: number;
      computed?: boolean;
    };
    const assets: Row[] = [];
    const liabilities: Row[] = [];
    const equity: Row[] = [];
    for (const g of grouped) {
      const account = accountById.get(g.accountId)!;
      const debit = round2(Number(g._sum.debit ?? 0));
      const credit = round2(Number(g._sum.credit ?? 0));
      const row: Row = {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        balance: 0,
      };
      if (account.type === 'asset') assets.push({ ...row, balance: round2(debit - credit) });
      else if (account.type === 'liability')
        liabilities.push({ ...row, balance: round2(credit - debit) });
      else equity.push({ ...row, balance: round2(credit - debit) });
    }
    for (const arr of [assets, liabilities, equity]) {
      arr.sort((a, b) => (a.accountCode ?? '').localeCompare(b.accountCode ?? ''));
    }

    const totalAssets = round2(assets.reduce((s, a) => s + a.balance, 0));
    const totalLiabilities = round2(liabilities.reduce((s, a) => s + a.balance, 0));
    const postedEquity = round2(equity.reduce((s, a) => s + a.balance, 0));

    // No period-closing procedure exists yet (docs/ACCOUNTING.md "Fiscal
    // Periods" / "Deferred: closing entries") - Sale/Expense postings never
    // sweep net income into an Equity account. Computed here (reusing the
    // same P&L source, never duplicated logic) and surfaced as one clearly
    // labeled, non-posted line so the sheet balances honestly instead of
    // silently merging an invented figure into a real Equity account.
    const pl = await this.getProfitAndLoss(tx, companyId, membershipId, { dateTo: asOfDate });
    const unclosedRetainedEarnings = pl.netProfit;
    const totalEquity = round2(postedEquity + unclosedRetainedEarnings);

    return {
      asOfDate: asOfDate ?? null,
      assets,
      liabilities,
      equity: [
        ...equity,
        {
          accountId: null,
          accountCode: null,
          accountName: 'الأرباح المرحّلة غير المقفلة (لم تُقفل بقيد رسمي بعد)',
          balance: unclosedRetainedEarnings,
          computed: true,
        },
      ],
      totals: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        isBalanced:
          Math.round(totalAssets * 100) === Math.round((totalLiabilities + totalEquity) * 100),
      },
    };
  }
}
