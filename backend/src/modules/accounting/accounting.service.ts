import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Account } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  DEFAULT_EXPENSE_CATEGORIES,
} from './constants/default-chart-of-accounts';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

/**
 * Chart of Accounts (docs/CHART_OF_ACCOUNTS.md). Journal posting/reversal
 * lives in JournalService - this service owns the account tree only, per
 * the documented "no manual double entry" principle: an Account can be
 * created/edited directly (accounting.manage), a JournalEntry never can.
 */
@Injectable()
export class AccountingService {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Called once, inside the same transaction as AuthService.registerCompany
   * - every company gets this exact set at creation. Returns a code->id map
   * so the caller (registerCompany) can hand it to
   * seedDefaultExpenseCategories without a second round-trip.
   */
  async seedDefaultChartOfAccounts(
    tx: TenantClient,
    companyId: string,
  ): Promise<Map<string, string>> {
    const codeToId = new Map<string, string>();
    for (const def of DEFAULT_CHART_OF_ACCOUNTS) {
      const parentId = def.parentCode ? (codeToId.get(def.parentCode) ?? null) : null;
      const account = await tx.account.create({
        data: { companyId, code: def.code, name: def.name, type: def.type, parentId },
      });
      codeToId.set(def.code, account.id);
    }
    return codeToId;
  }

  async seedDefaultExpenseCategories(
    tx: TenantClient,
    companyId: string,
    codeToId: Map<string, string>,
  ): Promise<void> {
    for (const category of DEFAULT_EXPENSE_CATEGORIES) {
      const accountId = codeToId.get(category.accountCode);
      if (!accountId) continue;
      await tx.expenseCategory.create({ data: { companyId, name: category.name, accountId } });
    }
  }

  listAccounts(tx: TenantClient, companyId: string) {
    return tx.account.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
  }

  async createAccount(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    dto: CreateAccountDto,
  ) {
    if (dto.parentId) {
      const parent = await tx.account.findFirst({ where: { id: dto.parentId, companyId } });
      if (!parent) throw new NotFoundException('الحساب الأب غير موجود');
    }
    const existing = await tx.account.findFirst({ where: { companyId, code: dto.code } });
    if (existing) throw new ConflictException('رمز الحساب مستخدم بالفعل');

    const account = await tx.account.create({
      data: {
        companyId,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId ?? null,
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'accounting.account.create',
      entityType: 'Account',
      entityId: account.id,
      afterState: { code: account.code, name: account.name, type: account.type },
    });

    return account;
  }

  async updateAccount(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    id: string,
    dto: UpdateAccountDto,
  ) {
    const account = await tx.account.findFirst({ where: { id, companyId } });
    if (!account) throw new NotFoundException('الحساب غير موجود');

    const updated = await tx.account.update({
      where: { id },
      data: {
        name: dto.name ?? account.name,
        isActive: dto.isActive ?? account.isActive,
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'accounting.account.update',
      entityType: 'Account',
      entityId: account.id,
      beforeState: { name: account.name, isActive: account.isActive },
      afterState: { name: updated.name, isActive: updated.isActive },
    });

    return updated;
  }

  /**
   * The Account Mapping lookup (docs/ACCOUNTING.md "Account Mapping"):
   * resolves a fixed company-scoped code (never a hardcoded UUID) to its
   * Account row. Missing means the company's Chart of Accounts wasn't
   * seeded correctly at registration - an internal invariant violation, not
   * a user-facing 404.
   */
  async getAccountByCode(tx: TenantClient, companyId: string, code: string): Promise<Account> {
    const account = await tx.account.findFirst({ where: { companyId, code } });
    if (!account) {
      throw new InternalServerErrorException(
        `حساب افتراضي مفقود لهذه المنشأة: ${code} - تأكد من تسجيل المنشأة عبر مسار التسجيل الصحيح`,
      );
    }
    return account;
  }
}
