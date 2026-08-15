import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_CODES } from '../accounting/constants/default-chart-of-accounts';
import { JournalService } from '../accounting/journal.service';
import { BranchScope, BranchScopeService } from '../iam/branch-scope.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

const EXPENSE_INCLUDE = { category: true } satisfies Prisma.ExpenseInclude;

/**
 * Expenses are always recorded as already paid - paymentMethod is required
 * and posts directly to Cash/Bank, no "expense payable" tracking
 * (docs/EXPENSES.md "Deferred"). Every financially-relevant edit (amount,
 * category, payment method) reverses the expense's existing journal entry
 * and posts a fresh one instead of ever touching a posted entry's lines -
 * see docs/EXPENSES.md "Update & the ledger".
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly auditService: AuditService,
    private readonly branchScopeService: BranchScopeService,
    private readonly journalService: JournalService,
  ) {}

  async createExpense(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    dto: CreateExpenseDto,
  ) {
    const existing = await tx.expense.findUnique({
      where: {
        companyId_clientReferenceId: { companyId, clientReferenceId: dto.clientReferenceId },
      },
      include: EXPENSE_INCLUDE,
    });
    if (existing) return existing;

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.EXPENSES_CREATE,
    );

    let branchId: string | null = null;
    if (dto.branchId) {
      const branch = await tx.branch.findFirst({
        where: { id: dto.branchId, companyId, deletedAt: null },
      });
      if (!branch) throw new NotFoundException('الفرع غير موجود');
      this.branchScopeService.assertBranchInScope(scope, branch.id);
      branchId = branch.id;
    }

    const category = await tx.expenseCategory.findFirst({
      where: { id: dto.categoryId, companyId, isActive: true },
    });
    if (!category) throw new NotFoundException('فئة المصروف غير موجودة');

    const expense = await tx.expense.create({
      data: {
        companyId,
        branchId,
        categoryId: category.id,
        amount: dto.amount,
        currency: 'SAR',
        paymentMethod: dto.paymentMethod,
        description: dto.description,
        reference: dto.reference,
        clientReferenceId: dto.clientReferenceId,
        actorMembershipId: membershipId,
      },
    });

    await this.postExpenseJournal(tx, companyId, membershipId, actorUserId, expense, category);

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId,
      action: 'expenses.expense.create',
      entityType: 'Expense',
      entityId: expense.id,
      afterState: { amount: dto.amount, categoryId: category.id, paymentMethod: dto.paymentMethod },
    });

    return this.getOwned(tx, companyId, expense.id);
  }

  async getByClientReference(tx: TenantClient, companyId: string, clientReferenceId: string) {
    const expense = await tx.expense.findUnique({
      where: { companyId_clientReferenceId: { companyId, clientReferenceId } },
      include: EXPENSE_INCLUDE,
    });
    if (!expense) throw new NotFoundException('المصروف غير موجود');
    return expense;
  }

  isDuplicateClientReference(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  async updateExpense(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    id: string,
    dto: UpdateExpenseDto,
  ) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.EXPENSES_UPDATE,
    );
    const expense = await tx.expense.findFirst({
      where: { id, companyId },
      include: EXPENSE_INCLUDE,
    });
    if (!expense) throw new NotFoundException('المصروف غير موجود');
    if (expense.branchId && !scope.allBranches && !scope.branchIds.has(expense.branchId)) {
      throw new ForbiddenException('هذا المصروف خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    if (expense.status === 'cancelled') {
      throw new ConflictException('لا يمكن تعديل مصروف محذوف');
    }

    let branchId = expense.branchId;
    if (dto.branchId !== undefined) {
      const branch = await tx.branch.findFirst({
        where: { id: dto.branchId, companyId, deletedAt: null },
      });
      if (!branch) throw new NotFoundException('الفرع غير موجود');
      this.branchScopeService.assertBranchInScope(scope, branch.id);
      branchId = branch.id;
    }

    let category = expense.category;
    if (dto.categoryId && dto.categoryId !== expense.categoryId) {
      const found = await tx.expenseCategory.findFirst({
        where: { id: dto.categoryId, companyId, isActive: true },
      });
      if (!found) throw new NotFoundException('فئة المصروف غير موجودة');
      category = found;
    }

    const amount = dto.amount ?? Number(expense.amount);
    const paymentMethod = dto.paymentMethod ?? expense.paymentMethod;
    const financiallyChanged =
      amount !== Number(expense.amount) ||
      category.id !== expense.categoryId ||
      paymentMethod !== expense.paymentMethod;

    const updated = await tx.expense.update({
      where: { id },
      data: {
        branchId,
        categoryId: category.id,
        amount,
        paymentMethod,
        description: dto.description ?? expense.description,
        reference: dto.reference ?? expense.reference,
      },
    });

    if (financiallyChanged) {
      const activeEntry = await this.findActiveJournalEntry(tx, companyId, expense.id);
      if (activeEntry) {
        await this.journalService.reverseJournalEntry(tx, companyId, {
          originalEntryId: activeEntry.id,
          referenceType: 'Expense',
          referenceId: expense.id,
          description: `تصحيح مصروف بعد تعديل`,
          actorMembershipId: membershipId,
          actorUserId,
        });
      }
      await this.postExpenseJournal(tx, companyId, membershipId, actorUserId, updated, category);
    }

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId,
      action: 'expenses.expense.update',
      entityType: 'Expense',
      entityId: expense.id,
      beforeState: {
        amount: expense.amount,
        categoryId: expense.categoryId,
        paymentMethod: expense.paymentMethod,
      },
      afterState: { amount, categoryId: category.id, paymentMethod },
    });

    return this.getOwned(tx, companyId, updated.id);
  }

  async deleteExpense(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    id: string,
  ) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.EXPENSES_DELETE,
    );
    const expense = await tx.expense.findFirst({ where: { id, companyId } });
    if (!expense) throw new NotFoundException('المصروف غير موجود');
    if (expense.branchId && !scope.allBranches && !scope.branchIds.has(expense.branchId)) {
      throw new ForbiddenException('هذا المصروف خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    if (expense.status === 'cancelled') {
      throw new ConflictException('هذا المصروف محذوف بالفعل');
    }

    const activeEntry = await this.findActiveJournalEntry(tx, companyId, expense.id);
    if (activeEntry) {
      await this.journalService.reverseJournalEntry(tx, companyId, {
        originalEntryId: activeEntry.id,
        referenceType: 'Expense',
        referenceId: expense.id,
        description: 'عكس قيد مصروف محذوف',
        actorMembershipId: membershipId,
        actorUserId,
      });
    }

    const cancelled = await tx.expense.update({
      where: { id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId: expense.branchId,
      action: 'expenses.expense.delete',
      entityType: 'Expense',
      entityId: expense.id,
    });

    return cancelled;
  }

  async list(tx: TenantClient, companyId: string, membershipId: string, query: QueryExpensesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.EXPENSES_READ,
    );

    const where: Prisma.ExpenseWhereInput = {
      companyId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(!scope.allBranches
        ? { OR: [{ branchId: null }, { branchId: { in: Array.from(scope.branchIds) } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      tx.expense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.expense.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async getOwned(tx: TenantClient, companyId: string, id: string, scope?: BranchScope) {
    const expense = await tx.expense.findFirst({
      where: { id, companyId },
      include: EXPENSE_INCLUDE,
    });
    if (!expense) throw new NotFoundException('المصروف غير موجود');
    if (expense.branchId && scope && !scope.allBranches && !scope.branchIds.has(expense.branchId)) {
      throw new ForbiddenException('هذا المصروف خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    return expense;
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
      PERMISSION_KEYS.EXPENSES_READ,
    );
    return this.getOwned(tx, companyId, id, scope);
  }

  private async findActiveJournalEntry(tx: TenantClient, companyId: string, expenseId: string) {
    return tx.journalEntry.findFirst({
      where: { companyId, referenceType: 'Expense', referenceId: expenseId, status: 'posted' },
    });
  }

  private async postExpenseJournal(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    expense: {
      id: string;
      branchId: string | null;
      amount: Prisma.Decimal | number;
      paymentMethod: string;
    },
    category: { name: string; accountId: string },
  ) {
    const cashOrBankCode =
      expense.paymentMethod === 'cash' ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
    const amount = Number(expense.amount);
    return this.journalService.postJournalEntry(tx, companyId, {
      branchId: expense.branchId,
      referenceType: 'Expense',
      referenceId: expense.id,
      description: `مصروف: ${category.name}`,
      actorMembershipId: membershipId,
      actorUserId,
      lines: [
        { accountId: category.accountId, debit: amount },
        { accountCode: cashOrBankCode, credit: amount },
      ],
    });
  }
}
