import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { round2 } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';
import { BranchScopeService } from '../iam/branch-scope.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { AccountingService } from './accounting.service';
import { QueryJournalEntriesDto } from './dto/query-journal-entries.dto';
import { FiscalPeriodsService } from './fiscal-periods.service';

export interface JournalLineInput {
  // Exactly one of these two - accountCode for the fixed, well-known
  // accounts (Cash/Bank/Inventory/AP/VAT/Revenue - docs/ACCOUNTING.md
  // "Account Mapping"); accountId for a caller that already resolved a
  // specific account row, e.g. ExpensesService posting to whatever Account
  // an ExpenseCategory maps to (which may be a custom, non-default account).
  accountCode?: string;
  accountId?: string;
  debit?: number;
  credit?: number;
  description?: string;
}

export interface PostJournalEntryParams {
  branchId?: string | null;
  referenceType: string;
  referenceId: string;
  description?: string;
  actorMembershipId?: string | null;
  actorUserId?: string | null;
  lines: JournalLineInput[];
}

const ENTRY_INCLUDE = {
  lines: { include: { account: true } },
} satisfies Prisma.JournalEntryInclude;

/**
 * The single choke point for posting a journal entry (docs/DATABASE.md §7,
 * documented since Phase 1: "every commercial operation posts its journal
 * automatically via an Accounting Service - no manual double entry").
 * SalesService, PurchasesService, and ExpensesService call this; there is
 * no HTTP endpoint that lets a client construct a JournalEntry directly.
 */
@Injectable()
export class JournalService {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly auditService: AuditService,
    private readonly branchScopeService: BranchScopeService,
    private readonly fiscalPeriodsService: FiscalPeriodsService,
  ) {}

  async postJournalEntry(tx: TenantClient, companyId: string, params: PostJournalEntryParams) {
    await this.fiscalPeriodsService.assertTodayNotLocked(tx, companyId);

    const totalDebit = round2(params.lines.reduce((sum, l) => sum + (l.debit ?? 0), 0));
    const totalCredit = round2(params.lines.reduce((sum, l) => sum + (l.credit ?? 0), 0));

    // Invariant, not user input validation: every caller in this codebase
    // computes both sides from the same source amounts, so a mismatch here
    // means a bug in the caller, not a bad request - see docs/ACCOUNTING.md
    // "Double-entry integrity".
    if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
      throw new UnprocessableEntityException(
        `قيد غير متوازن: مدين ${totalDebit} لا يساوي دائن ${totalCredit}`,
      );
    }
    if (totalDebit === 0) {
      throw new UnprocessableEntityException('لا يمكن ترحيل قيد محاسبي بقيمة صفرية');
    }

    const entry = await tx.journalEntry.create({
      data: {
        companyId,
        branchId: params.branchId ?? null,
        status: 'posted',
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        description: params.description,
        actorMembershipId: params.actorMembershipId ?? null,
      },
    });

    for (const line of params.lines) {
      const account = line.accountId
        ? await tx.account.findFirst({ where: { id: line.accountId, companyId } })
        : line.accountCode
          ? await this.accountingService.getAccountByCode(tx, companyId, line.accountCode)
          : null;
      if (!account) {
        throw new InternalServerErrorException(
          'سطر قيد محاسبي بلا حساب صالح (لا accountCode ولا accountId)',
        );
      }
      await tx.journalLine.create({
        data: {
          companyId,
          journalEntryId: entry.id,
          accountId: account.id,
          debit: line.debit ?? 0,
          credit: line.credit ?? 0,
          description: line.description,
        },
      });
    }

    await this.auditService.log(tx, {
      companyId,
      actorUserId: params.actorUserId ?? undefined,
      branchId: params.branchId ?? undefined,
      action: 'accounting.journal.post',
      entityType: 'JournalEntry',
      entityId: entry.id,
      afterState: {
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        totalDebit,
        totalCredit,
      },
    });

    return this.getEntryWithLines(tx, companyId, entry.id);
  }

  /**
   * Never mutates or deletes the original entry (docs/JOURNAL_ENTRIES.md
   * "Posted vs corrections") - creates a new entry with debit/credit
   * swapped on every line, and marks the original `reversed` purely as an
   * informational pointer to where its effect went.
   */
  async reverseJournalEntry(
    tx: TenantClient,
    companyId: string,
    params: {
      originalEntryId: string;
      referenceType: string;
      referenceId: string;
      description?: string;
      actorMembershipId?: string | null;
      actorUserId?: string | null;
    },
  ) {
    await this.fiscalPeriodsService.assertTodayNotLocked(tx, companyId);

    const original = await tx.journalEntry.findFirst({
      where: { id: params.originalEntryId, companyId },
      include: { lines: true },
    });
    if (!original) throw new NotFoundException('القيد الأصلي غير موجود');
    if (original.status === 'reversed') {
      throw new ConflictException('هذا القيد مُعكوس بالفعل');
    }

    // Original flipped to 'reversed' BEFORE the new entry is created - a
    // partial unique index (journal_entries_one_posted_opening_balance)
    // enforces "at most one posted entry" for some reference types, so both
    // rows must never be status='posted' at the same instant even
    // transiently within this transaction.
    await tx.journalEntry.update({ where: { id: original.id }, data: { status: 'reversed' } });

    const reversal = await tx.journalEntry.create({
      data: {
        companyId,
        branchId: original.branchId,
        status: 'posted',
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        description: params.description ?? `عكس القيد ${original.id}`,
        reversalOfEntryId: original.id,
        actorMembershipId: params.actorMembershipId ?? null,
      },
    });

    for (const line of original.lines) {
      await tx.journalLine.create({
        data: {
          companyId,
          journalEntryId: reversal.id,
          accountId: line.accountId,
          debit: line.credit,
          credit: line.debit,
          description: line.description,
        },
      });
    }

    await this.auditService.log(tx, {
      companyId,
      actorUserId: params.actorUserId ?? undefined,
      branchId: original.branchId ?? undefined,
      action: 'accounting.journal.reverse',
      entityType: 'JournalEntry',
      entityId: reversal.id,
      beforeState: { reversalOfEntryId: original.id },
    });

    return this.getEntryWithLines(tx, companyId, reversal.id);
  }

  async getEntryWithLines(tx: TenantClient, companyId: string, id: string) {
    return tx.journalEntry.findFirst({ where: { id, companyId }, include: ENTRY_INCLUDE });
  }

  async list(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    query: QueryJournalEntriesDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.ACCOUNTING_READ,
    );

    const where: Prisma.JournalEntryWhereInput = {
      companyId,
      ...(query.referenceType ? { referenceType: query.referenceType } : {}),
      ...(!scope.allBranches
        ? { OR: [{ branchId: null }, { branchId: { in: Array.from(scope.branchIds) } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      tx.journalEntry.findMany({
        where,
        include: ENTRY_INCLUDE,
        orderBy: { postedAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.journalEntry.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
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
      PERMISSION_KEYS.ACCOUNTING_READ,
    );
    const entry = await this.getEntryWithLines(tx, companyId, id);
    if (!entry) throw new NotFoundException('القيد غير موجود');
    if (entry.branchId && !scope.allBranches && !scope.branchIds.has(entry.branchId)) {
      throw new ForbiddenException('هذا القيد خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    return entry;
  }
}
