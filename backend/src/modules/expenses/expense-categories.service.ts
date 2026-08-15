import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantClient } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AccountingService } from '../accounting/accounting.service';
import { ACCOUNT_CODES } from '../accounting/constants/default-chart-of-accounts';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';

/** Manageable, not a closed list (docs/EXPENSES.md) - the 6 defaults seeded at registration are a starting point, not a hard-coded enum. */
@Injectable()
export class ExpenseCategoriesService {
  constructor(
    private readonly auditService: AuditService,
    private readonly accountingService: AccountingService,
  ) {}

  list(tx: TenantClient, companyId: string) {
    return tx.expenseCategory.findMany({
      where: { companyId, isActive: true },
      include: { account: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    dto: CreateExpenseCategoryDto,
  ) {
    const existing = await tx.expenseCategory.findFirst({ where: { companyId, name: dto.name } });
    if (existing) throw new ConflictException('اسم الفئة مستخدم بالفعل');

    let accountId = dto.accountId;
    if (accountId) {
      const account = await tx.account.findFirst({
        where: { id: accountId, companyId, type: 'expense' },
      });
      if (!account) throw new NotFoundException('الحساب المحاسبي غير موجود أو ليس من نوع مصروفات');
    } else {
      const defaultAccount = await this.accountingService.getAccountByCode(
        tx,
        companyId,
        ACCOUNT_CODES.EXPENSE_OTHER,
      );
      accountId = defaultAccount.id;
    }

    const category = await tx.expenseCategory.create({
      data: { companyId, name: dto.name, accountId },
      include: { account: true },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'expenses.category.create',
      entityType: 'ExpenseCategory',
      entityId: category.id,
      afterState: { name: category.name, accountId },
    });

    return category;
  }
}
