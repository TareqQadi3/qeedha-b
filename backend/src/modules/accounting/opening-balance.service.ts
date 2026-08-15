import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateOpeningBalanceDto } from './dto/create-opening-balance.dto';
import { JournalLineInput, JournalService } from './journal.service';

/**
 * Accounting Opening Balance - distinct from Inventory Opening Stock
 * (InventoryService.setOpeningBalance, a stock_movements row). This is a
 * normal JournalEntry (referenceType='OpeningBalance', referenceId=companyId
 * so it's trivially findable) posted through the one existing choke point
 * (JournalService.postJournalEntry), which already enforces Debit=Credit and
 * company/branch/audit rules - no separate table, no new invariant logic.
 * Company-level only (no branchId): the Chart of Accounts and opening trial
 * balance aren't branch-specific in this system.
 *
 * "Active" means posted AND not itself a reversal (reversalOfEntryId=null) -
 * a reversal entry also has status='posted' (it IS a posted entry, just one
 * that undoes another), so it must be excluded from "is there currently an
 * opening balance in effect" checks, or reversing one would permanently block
 * ever posting a new one.
 */
@Injectable()
export class OpeningBalanceService {
  constructor(
    private readonly auditService: AuditService,
    private readonly journalService: JournalService,
  ) {}

  private findActive(tx: TenantClient, companyId: string) {
    return tx.journalEntry.findFirst({
      where: {
        companyId,
        referenceType: 'OpeningBalance',
        referenceId: companyId,
        status: 'posted',
        reversalOfEntryId: null,
      },
      include: { lines: { include: { account: true } } },
    });
  }

  async get(tx: TenantClient, companyId: string) {
    return this.findActive(tx, companyId);
  }

  async create(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    dto: CreateOpeningBalanceDto,
  ) {
    const existing = await this.findActive(tx, companyId);
    if (existing) {
      throw new ConflictException(
        'تم تسجيل رصيد افتتاحي لهذه المنشأة بالفعل - يجب عكسه أولًا (POST /accounting/opening-balance/reverse) قبل تسجيل رصيد جديد',
      );
    }

    const lines: JournalLineInput[] = dto.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
    }));

    let entry;
    try {
      entry = await this.journalService.postJournalEntry(tx, companyId, {
        referenceType: 'OpeningBalance',
        referenceId: companyId,
        description: dto.description ?? 'الأرصدة الافتتاحية',
        actorMembershipId: membershipId,
        actorUserId,
        lines,
      });
    } catch (err) {
      // Loser of a true concurrent double-submit - the partial unique index
      // journal_entries_one_posted_opening_balance caught it at the DB level.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'تم تسجيل رصيد افتتاحي لهذه المنشأة للتو (طلب متزامن) - يجب عكسه أولًا قبل تسجيل رصيد جديد',
        );
      }
      throw err;
    }
    if (!entry) throw new InternalServerErrorException('فشل ترحيل قيد الرصيد الافتتاحي');

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'accounting.opening_balance.create',
      entityType: 'JournalEntry',
      entityId: entry.id,
      afterState: { lineCount: dto.lines.length },
    });

    return entry;
  }

  async reverse(tx: TenantClient, companyId: string, membershipId: string, actorUserId: string) {
    const existing = await this.findActive(tx, companyId);
    if (!existing) throw new NotFoundException('لا يوجد رصيد افتتاحي مُرحَّل لعكسه');

    const reversal = await this.journalService.reverseJournalEntry(tx, companyId, {
      originalEntryId: existing.id,
      referenceType: 'OpeningBalance',
      referenceId: companyId,
      description: 'عكس الأرصدة الافتتاحية',
      actorMembershipId: membershipId,
      actorUserId,
    });
    if (!reversal) throw new InternalServerErrorException('فشل عكس قيد الرصيد الافتتاحي');

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'accounting.opening_balance.reverse',
      entityType: 'JournalEntry',
      entityId: reversal.id,
      beforeState: { originalEntryId: existing.id },
    });

    return reversal;
  }
}
