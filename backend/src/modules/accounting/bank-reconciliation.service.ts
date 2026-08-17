import { Injectable } from '@nestjs/common';
import { TenantClient } from '../../common/prisma/prisma.service';
import { round2 } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';
import { AccountingService } from './accounting.service';
import { CreateBankReconciliationDto } from './dto/create-bank-reconciliation.dto';

function dayEnd(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Milestone 7 (docs/ACCOUNTING.md "Bank Reconciliation"): a minimal internal
 * reconciliation foundation - compares the BOOK balance (derived live from
 * posted JournalLines on the Cash/Bank account, same source every other
 * report reads through - see AccountingReportsService) against an
 * externally-reported STATEMENT balance as of a date, and records the
 * difference. Deliberately company-wide (not branch-scoped) and header-only
 * (no per-transaction matching table) - see the class-level doc comment on
 * CreateBankReconciliationDto and docs/ACCOUNTING.md for why line-level
 * matching is a documented, deliberate scope limit rather than an oversight:
 * it would require a disproportionate new subsystem (a matching UI, a
 * matched/unmatched state per transaction, an import format for bank
 * statement lines) for what this product needs today. No external bank
 * integration of any kind - `statementBalance` is always a manually entered
 * number the user reads off a real bank statement/register tape.
 */
@Injectable()
export class BankReconciliationService {
  constructor(
    private readonly auditService: AuditService,
    private readonly accountingService: AccountingService,
  ) {}

  async create(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    dto: CreateBankReconciliationDto,
  ) {
    const account = await this.accountingService.getAccountByCode(tx, companyId, dto.accountCode);

    // Cash/Bank are always debit-normal asset accounts - book balance is
    // simply the running debit-minus-credit total of every posted line on
    // this account up to and including asOfDate, the exact same math
    // AccountingReportsService.getGeneralLedger uses for its closing
    // balance (not duplicated logic, just inlined for this one account/date
    // pair rather than pulling in the full GL response shape).
    const agg = await tx.journalLine.aggregate({
      where: {
        companyId,
        accountId: account.id,
        journalEntry: { status: 'posted', postedAt: { lte: dayEnd(dto.asOfDate) } },
      },
      _sum: { debit: true, credit: true },
    });
    const bookBalance = round2(Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));
    const difference = round2(dto.statementBalance - bookBalance);

    const reconciliation = await tx.bankReconciliation.create({
      data: {
        companyId,
        accountCode: dto.accountCode,
        asOfDate: new Date(dto.asOfDate),
        statementBalance: dto.statementBalance,
        bookBalance,
        difference,
        notes: dto.notes,
        actorMembershipId: membershipId,
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'accounting.reconciliation.create',
      entityType: 'BankReconciliation',
      entityId: reconciliation.id,
      afterState: {
        accountCode: dto.accountCode,
        asOfDate: dto.asOfDate,
        statementBalance: dto.statementBalance,
        bookBalance,
        difference,
      },
    });

    return reconciliation;
  }

  list(tx: TenantClient, companyId: string, accountCode?: string) {
    return tx.bankReconciliation.findMany({
      where: { companyId, ...(accountCode ? { accountCode } : {}) },
      orderBy: { asOfDate: 'desc' },
    });
  }
}
