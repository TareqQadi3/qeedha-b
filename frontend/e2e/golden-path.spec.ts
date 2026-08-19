import { expect, test } from '@playwright/test';
import { login, loginWithIdentifier, logout, registerMerchant, uniqueId } from './helpers';

/**
 * Full merchant journey (Milestone 2 "Playwright" / "Full Trial", extended
 * in Milestone 5 to cover the full Accounting reporting/period surface, and
 * in Milestone 6 to verify weighted-average inventory valuation/COGS):
 * Register -> Product -> Inventory (opening stock + average cost/value) ->
 * Customer -> Supplier -> Purchase -> Receive -> POS sale -> Payment ->
 * Invoice -> Expense -> Accounting -> Trial Balance -> General Ledger ->
 * P&L (COGS/Gross Profit) -> Balance Sheet -> AR/AP -> Fiscal Period ->
 * Logout -> Login. Every step goes through the real UI against the real
 * backend API and database - no mocked requests.
 */
test('merchant can go from registration to a posted sale, expense, and see it all reflected in accounting', async ({
  page,
}) => {
  const id = uniqueId();
  const productName = `منتج بلايرايت ${id}`;
  const productSku = `PW-${id}`;
  const customerName = `عميل بلايرايت ${id}`;
  const supplierName = `مورد بلايرايت ${id}`;

  const merchant = await registerMerchant(page);

  // ---- Product ----
  await page.goto('/products');
  await page.getByRole('button', { name: '+ منتج جديد' }).click();
  await page.getByLabel('SKU').fill(productSku);
  await page.getByLabel('اسم المنتج').fill(productName);
  await page.getByLabel('سعر التكلفة').fill('5');
  await page.getByLabel('سعر البيع').fill('10');
  await page.getByRole('button', { name: 'حفظ المنتج' }).click();
  await expect(page.getByText(productName)).toBeVisible();

  // ---- Inventory: opening stock (no explicit unit cost -> falls back to
  // Product.costPrice = 5, so average cost = 5 and inventory value = 500) ----
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'رصيد افتتاحي' }).click();
  await page.getByLabel('المنتج').selectOption({ label: `${productName} (${productSku})` });
  await page.getByLabel('الكمية').fill('100');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText(productSku)).toBeVisible();
  const inventoryRow = page.getByRole('row').filter({ hasText: productSku });
  await expect(inventoryRow.getByText('5.00')).toBeVisible();
  await expect(inventoryRow.getByText('500.00')).toBeVisible();

  // ---- Customer ----
  await page.goto('/customers');
  await page.getByRole('button', { name: '+ عميل جديد' }).click();
  await page.getByLabel('الاسم').fill(customerName);
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText(customerName)).toBeVisible();

  // ---- Supplier ----
  await page.goto('/suppliers');
  await page.getByRole('button', { name: '+ مورد جديد' }).click();
  await page.getByLabel('الاسم').fill(supplierName);
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText(supplierName)).toBeVisible();

  // ---- Purchase + Receive ----
  await page.goto('/purchases');
  await page.getByRole('button', { name: '+ أمر شراء جديد' }).click();
  await page.getByLabel('المورد').selectOption({ label: supplierName });
  const productPicker = page.getByRole('combobox').filter({ hasText: 'اختر منتجًا لإضافته' });
  await productPicker.selectOption({ label: `${productName} (${productSku})` });
  await page.getByRole('button', { name: '+ إضافة' }).click();
  await page.getByRole('button', { name: 'حفظ أمر الشراء' }).click();
  await expect(page.getByText(supplierName).first()).toBeVisible();
  await page.getByRole('button', { name: 'استلام' }).first().click();
  await expect(page.getByText('مُستلَم').first()).toBeVisible();

  // ---- POS sale ----
  await page.goto('/pos');
  await page.getByPlaceholder('ابحث بالاسم أو SKU أو امسح الباركود...').fill(productName);
  await page.getByRole('button', { name: new RegExp(productName) }).click();
  await page.getByLabel('العميل (اختياري)').selectOption({ label: customerName });
  await page.getByRole('button', { name: 'ملء المبلغ كاملًا' }).click();
  await page.getByRole('button', { name: 'إتمام البيع' }).click();
  await expect(page.getByText('تم إتمام البيع بنجاح')).toBeVisible();

  // ---- Invoice shows up in Sales/Invoices ----
  await page.goto('/sales');
  await expect(page.getByText(customerName)).toBeVisible();

  // ---- Expense ----
  await page.goto('/expenses');
  await page.getByRole('button', { name: '+ مصروف جديد' }).click();
  await page.getByLabel('الفئة').selectOption({ index: 1 });
  await page.getByLabel('المبلغ').fill('40');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('40').first()).toBeVisible();

  // ---- Accounting: journal entries reflect Sale/Purchase/Expense ----
  await page.goto('/accounting');
  await page.getByRole('button', { name: 'القيود المحاسبية' }).click();
  await expect(page.getByText('Sale').first()).toBeVisible();
  await expect(page.getByText('Purchase').first()).toBeVisible();
  await expect(page.getByText('Expense').first()).toBeVisible();

  // ---- Reports: Trial Balance is balanced ----
  await page.goto('/reports');
  await expect(page.getByText('متوازن', { exact: true })).toBeVisible();

  // ---- Reports: General Ledger shows a running balance for an account with activity ----
  await page.getByRole('button', { name: 'دفتر الأستاذ' }).click();
  await expect(page.getByText('الرصيد الافتتاحي:')).toBeVisible();
  await expect(page.getByText('الرصيد الختامي:')).toBeVisible();

  // ---- Reports: Profit & Loss reflects the sale, the expense, and COGS ----
  await page.getByRole('button', { name: 'الأرباح والخسائر' }).click();
  await expect(page.getByText('صافي الربح / الخسارة')).toBeVisible();
  await expect(page.getByText('تكلفة البضاعة المباعة (COGS)')).toBeVisible();
  await expect(page.getByText('إجمالي الربح (Gross Profit)')).toBeVisible();

  // ---- Reports: Balance Sheet balances (Assets = Liabilities + Equity) ----
  await page.getByRole('button', { name: 'الميزانية العمومية' }).click();
  await expect(page.getByText('الميزانية متوازنة')).toBeVisible();

  // ---- Receivables/Payables: this sale was paid in full, so AR is empty; AP shows the supplier ----
  await page.goto('/receivables-payables');
  await expect(page.getByText('لا توجد أرصدة عملاء آجلة حاليًا')).toBeVisible();
  await page.getByRole('button', { name: 'ذمم الموردين (AP)' }).click();
  await expect(page.getByText(supplierName)).toBeVisible();

  // ---------------------------------------------------------------------------
  // Milestone 7: Supplier payment + Purchase return
  // ---------------------------------------------------------------------------
  await page.goto('/purchases');
  await page.getByText('تفاصيل / دفع / مرتجع').first().click();
  await expect(page.getByText(/الرصيد المستحق: 5\.75/)).toBeVisible();
  await page.getByLabel('المبلغ').fill('5.75');
  await page.getByRole('button', { name: 'تسجيل الدفعة' }).click();
  await expect(page.getByText(/الرصيد المستحق: 0\.00/)).toBeVisible();

  // Full return of the single unit received on this purchase - the payment
  // form above disappears once the balance hits zero, so the only remaining
  // number input is the return-quantity field.
  await page.getByRole('spinbutton').fill('1');
  await page.getByRole('button', { name: 'تسجيل مرتجع مشتريات' }).click();
  await expect(page.getByText('مرتجعات سابقة')).toBeVisible();

  // ---------------------------------------------------------------------------
  // Milestone 7: Sales return on the earlier fully-paid POS sale
  // ---------------------------------------------------------------------------
  await page.goto('/sales');
  await page.getByText('تفاصيل / دفع / مرتجع').first().click();
  await expect(page.getByText(/الرصيد المستحق/)).toBeVisible();
  await page.getByRole('spinbutton').fill('1');
  await page.getByRole('button', { name: 'تسجيل مرتجع مبيعات' }).click();
  await expect(page.getByText('مرتجعات سابقة')).toBeVisible();

  // ---------------------------------------------------------------------------
  // Milestone 7: Customer credit sale -> AR balance -> AR payment
  // ---------------------------------------------------------------------------
  await page.goto('/pos');
  await page.getByPlaceholder('ابحث بالاسم أو SKU أو امسح الباركود...').fill(productName);
  await page.getByRole('button', { name: new RegExp(productName) }).click();
  await page.getByLabel('العميل (اختياري)').selectOption({ label: customerName });
  // Leave every payment line empty -> a fully-credit sale, allowed only
  // because a customer is selected above.
  await page.getByRole('button', { name: 'إتمام البيع' }).click();
  await expect(page.getByText('تم إتمام البيع بنجاح')).toBeVisible();
  await page.getByRole('button', { name: 'بيع جديد' }).click();

  await page.goto('/receivables-payables');
  await expect(page.getByText(customerName)).toBeVisible();

  await page.goto('/sales');
  const creditRow = page.getByRole('row').filter({ hasText: customerName }).filter({ hasText: 'آجل بالكامل' });
  await creditRow.getByText('تفاصيل / دفع / مرتجع').click();
  await expect(page.getByText(/الرصيد المستحق: (?!0\.00)/)).toBeVisible();
  await page.getByLabel('المبلغ').fill('11.5');
  await page.getByRole('button', { name: 'تسجيل الدفعة' }).click();
  await expect(page.getByText(/الرصيد المستحق: 0\.00/)).toBeVisible();

  // ---------------------------------------------------------------------------
  // Milestone 7: Inventory adjustment + Stock count accounting, then Bank Reconciliation
  // ---------------------------------------------------------------------------
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'تسوية مخزون' }).click();
  await page.getByLabel('المنتج').selectOption({ label: `${productName} (${productSku})` });
  await page.getByLabel('الفرق (موجب للزيادة، سالب للنقصان)').fill('2');
  await page.getByLabel(/تكلفة الوحدة/).fill('5');
  await page.getByLabel('السبب').fill('فرق جرد بلايرايت');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByRole('cell', { name: productSku })).toBeVisible();

  await page.goto('/accounting');
  await page.getByRole('button', { name: 'القيود المحاسبية' }).click();
  await expect(page.getByText('StockAdjustment').first()).toBeVisible();

  const today10 = new Date().toISOString().slice(0, 10);
  await page.getByRole('button', { name: 'التسوية البنكية/النقدية' }).click();
  await page.getByRole('button', { name: '+ تسوية جديدة' }).click();
  await page.getByLabel('حتى تاريخ').fill(today10);
  await page.getByLabel('رصيد كشف الحساب').fill('50');
  await page.getByRole('button', { name: 'تسجيل التسوية' }).click();
  await expect(page.getByText('الصندوق (نقدًا)')).toBeVisible();
  await expect(page.getByText('50.00')).toBeVisible();

  // ---- Fiscal Periods: create a period covering today and see it listed as open ----
  const periodName = `فترة بلايرايت ${id}`;
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  await page.goto('/accounting');
  await page.getByRole('button', { name: 'الفترات المحاسبية' }).click();
  await page.getByRole('button', { name: '+ فترة محاسبية جديدة' }).click();
  await page.getByLabel('الاسم').fill(periodName);
  await page.getByLabel('من تاريخ').fill(monthStart);
  await page.getByLabel('إلى تاريخ').fill(monthEnd);
  await page.getByRole('button', { name: 'إنشاء الفترة' }).click();
  await expect(page.getByText(periodName)).toBeVisible();
  await expect(page.getByText('مفتوحة').first()).toBeVisible();

  // ---- Milestone 8: subscription/plan/trial visibility - a brand-new
  // registration must show a real, connected trial subscription (no mocked
  // backend), the Professional plan's features, and usage counts that
  // reflect everything created above in this same test run ----
  await page.goto('/subscription');
  await expect(page.getByText('الاحترافية').first()).toBeVisible();
  await expect(page.getByText('فترة تجريبية')).toBeVisible();
  await expect(page.getByText(/متبقٍ \d+ (يوم|أيام)/)).toBeVisible();
  await expect(page.getByText('الذمم المدينة والدائنة')).toBeVisible();
  await expect(page.getByText('الأساسية')).toBeVisible();
  await expect(page.getByText(/تواصل مع الدعم/).first()).toBeVisible();

  // ---------------------------------------------------------------------------
  // Milestone 9: Qeedha integration connection lifecycle (view/link/revoke -
  // no external transaction UI, since transactions are submitted by Qeedha
  // itself against the API, never through this merchant-facing screen)
  // ---------------------------------------------------------------------------
  await page.goto('/integration');
  await expect(page.getByText('غير مرتبط')).toBeVisible();
  await page.getByRole('button', { name: 'ربط التكامل' }).click();
  await expect(page.getByText('متصل')).toBeVisible();
  await expect(page.getByText(/يُعرض مرة واحدة فقط/)).toBeVisible();
  const publicReference = await page
    .locator('div.font-mono', { hasText: /^qic_/ })
    .first()
    .innerText();
  expect(publicReference).toMatch(/^qic_/);

  await page.getByRole('button', { name: 'قطع الاتصال' }).click();
  await page.getByRole('button', { name: 'تأكيد القطع' }).click();
  await expect(page.getByText('موقوف')).toBeVisible();
  await expect(page.getByRole('button', { name: 'إعادة ربط التكامل' })).toBeVisible();

  // ---------------------------------------------------------------------------
  // Team: the owner creates a POS (Cashier) account with only a name,
  // username and password (no email) - see docs/DOMAIN_MODEL.md "Team
  // accounts". The cashier logs in with that username, can use POS, but is
  // blocked from Team/Accounting (role-scoped permissions, not just UI).
  // ---------------------------------------------------------------------------
  const cashierUsername = `cashier-pw-${id}`;
  const cashierPassword = 'CashierPassPW123';
  await page.goto('/team');
  await page.getByRole('button', { name: '+ عضو جديد' }).click();
  await page.getByLabel('اسم الموظف').fill('كاشير بلايرايت');
  await page.getByLabel(/^اسم المستخدم/).fill(cashierUsername);
  await page.getByLabel(/^كلمة المرور/).fill(cashierPassword);
  await page.getByLabel('نوع الحساب (الدور)').selectOption({ label: 'Cashier' });
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByText(cashierUsername)).toBeVisible();

  await logout(page);
  await loginWithIdentifier(page, cashierUsername, cashierPassword);
  await expect(page.getByText('مرحبًا،')).toBeVisible();
  await page.goto('/team');
  await expect(page.getByText('لا تملك صلاحية عرض الفريق')).toBeVisible();
  await page.goto('/accounting');
  await expect(page.getByText('لا تملك صلاحية عرض الحسابات')).toBeVisible();
  await page.goto('/pos');
  await expect(page.getByPlaceholder('ابحث بالاسم أو SKU أو امسح الباركود...')).toBeVisible();

  // ---- Logout -> Login again as the owner (session survives a fresh login) ----
  await logout(page);
  await login(page, merchant);
  await expect(page.getByText('مرحبًا،')).toBeVisible();
});
