import { AccountType } from '@prisma/client';

/**
 * Fixed, company-scoped lookup keys - not database IDs (docs/ACCOUNTING.md
 * "Account Mapping"). AccountingService resolves "the Cash account for this
 * company" via (companyId, code), never a hardcoded UUID. Every company gets
 * this exact set seeded at registration (AuthService.registerCompany).
 */
export const ACCOUNT_CODES = {
  ASSETS: '1000',
  CASH: '1010',
  BANK: '1020',
  ACCOUNTS_RECEIVABLE: '1100',
  INVENTORY: '1200',
  VAT_RECEIVABLE: '1300',
  LIABILITIES: '2000',
  ACCOUNTS_PAYABLE: '2010',
  VAT_PAYABLE: '2100',
  EQUITY: '3000',
  OWNER_EQUITY: '3010',
  REVENUE: '4000',
  SALES_REVENUE: '4010',
  EXPENSES: '5000',
  // Reserved, unused in Phase 4 - no inventory valuation method has been
  // chosen yet, so no COGS line is ever posted to it. See
  // docs/ACCOUNTING.md "Deferred: COGS / inventory valuation".
  COST_OF_GOODS_SOLD: '5010',
  EXPENSE_RENT: '5020',
  EXPENSE_ELECTRICITY: '5030',
  EXPENSE_TRANSPORT: '5040',
  EXPENSE_MAINTENANCE: '5050',
  EXPENSE_SUPPLIES: '5060',
  EXPENSE_OTHER: '5090',
} as const;

interface DefaultAccountDefinition {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
}

/** Seeded in this exact order so a parent's code is always resolved before any child references it. */
export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccountDefinition[] = [
  { code: ACCOUNT_CODES.ASSETS, name: 'الأصول', type: 'asset' },
  {
    code: ACCOUNT_CODES.CASH,
    name: 'الصندوق (نقدًا)',
    type: 'asset',
    parentCode: ACCOUNT_CODES.ASSETS,
  },
  { code: ACCOUNT_CODES.BANK, name: 'البنك', type: 'asset', parentCode: ACCOUNT_CODES.ASSETS },
  {
    code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
    name: 'ذمم مدينة (عملاء)',
    type: 'asset',
    parentCode: ACCOUNT_CODES.ASSETS,
  },
  {
    code: ACCOUNT_CODES.INVENTORY,
    name: 'المخزون',
    type: 'asset',
    parentCode: ACCOUNT_CODES.ASSETS,
  },
  {
    code: ACCOUNT_CODES.VAT_RECEIVABLE,
    name: 'ضريبة القيمة المضافة القابلة للاسترداد',
    type: 'asset',
    parentCode: ACCOUNT_CODES.ASSETS,
  },
  { code: ACCOUNT_CODES.LIABILITIES, name: 'الخصوم', type: 'liability' },
  {
    code: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
    name: 'ذمم دائنة (موردون)',
    type: 'liability',
    parentCode: ACCOUNT_CODES.LIABILITIES,
  },
  {
    code: ACCOUNT_CODES.VAT_PAYABLE,
    name: 'ضريبة القيمة المضافة المستحقة',
    type: 'liability',
    parentCode: ACCOUNT_CODES.LIABILITIES,
  },
  { code: ACCOUNT_CODES.EQUITY, name: 'حقوق الملكية', type: 'equity' },
  {
    code: ACCOUNT_CODES.OWNER_EQUITY,
    name: 'رأس مال المالك',
    type: 'equity',
    parentCode: ACCOUNT_CODES.EQUITY,
  },
  { code: ACCOUNT_CODES.REVENUE, name: 'الإيرادات', type: 'revenue' },
  {
    code: ACCOUNT_CODES.SALES_REVENUE,
    name: 'إيرادات المبيعات',
    type: 'revenue',
    parentCode: ACCOUNT_CODES.REVENUE,
  },
  { code: ACCOUNT_CODES.EXPENSES, name: 'المصروفات', type: 'expense' },
  {
    code: ACCOUNT_CODES.COST_OF_GOODS_SOLD,
    name: 'تكلفة البضاعة المباعة',
    type: 'expense',
    parentCode: ACCOUNT_CODES.EXPENSES,
  },
  {
    code: ACCOUNT_CODES.EXPENSE_RENT,
    name: 'الإيجار',
    type: 'expense',
    parentCode: ACCOUNT_CODES.EXPENSES,
  },
  {
    code: ACCOUNT_CODES.EXPENSE_ELECTRICITY,
    name: 'الكهرباء',
    type: 'expense',
    parentCode: ACCOUNT_CODES.EXPENSES,
  },
  {
    code: ACCOUNT_CODES.EXPENSE_TRANSPORT,
    name: 'النقل والمواصلات',
    type: 'expense',
    parentCode: ACCOUNT_CODES.EXPENSES,
  },
  {
    code: ACCOUNT_CODES.EXPENSE_MAINTENANCE,
    name: 'الصيانة',
    type: 'expense',
    parentCode: ACCOUNT_CODES.EXPENSES,
  },
  {
    code: ACCOUNT_CODES.EXPENSE_SUPPLIES,
    name: 'المستلزمات',
    type: 'expense',
    parentCode: ACCOUNT_CODES.EXPENSES,
  },
  {
    code: ACCOUNT_CODES.EXPENSE_OTHER,
    name: 'مصروفات أخرى',
    type: 'expense',
    parentCode: ACCOUNT_CODES.EXPENSES,
  },
];

/** Default ExpenseCategory rows, each linked to its matching expense account - the concrete Account Mapping for expenses. */
export const DEFAULT_EXPENSE_CATEGORIES: { name: string; accountCode: string }[] = [
  { name: 'الإيجار', accountCode: ACCOUNT_CODES.EXPENSE_RENT },
  { name: 'الكهرباء', accountCode: ACCOUNT_CODES.EXPENSE_ELECTRICITY },
  { name: 'النقل والمواصلات', accountCode: ACCOUNT_CODES.EXPENSE_TRANSPORT },
  { name: 'الصيانة', accountCode: ACCOUNT_CODES.EXPENSE_MAINTENANCE },
  { name: 'المستلزمات', accountCode: ACCOUNT_CODES.EXPENSE_SUPPLIES },
  { name: 'أخرى', accountCode: ACCOUNT_CODES.EXPENSE_OTHER },
];
