import { expect, test } from '@playwright/test';
import { login, logout, registerMerchant, uniqueId } from './helpers';

/**
 * Full merchant journey (Milestone 2 "Playwright" / "Full Trial"):
 * Register -> Product -> Inventory -> Customer -> Supplier -> Purchase ->
 * Receive -> POS sale -> Payment -> Invoice -> Expense -> Accounting ->
 * Reports -> Logout -> Login. Every step goes through the real UI against
 * the real backend API and database - no mocked requests.
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

  // ---- Inventory: opening stock ----
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'رصيد افتتاحي' }).click();
  await page.getByLabel('المنتج').selectOption({ label: `${productName} (${productSku})` });
  await page.getByLabel('الكمية').fill('100');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText(productSku)).toBeVisible();

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

  // ---- Receivables/Payables: AP shows the supplier ----
  await page.goto('/receivables-payables');
  await page.getByRole('button', { name: 'ذمم الموردين (AP)' }).click();
  await expect(page.getByText(supplierName)).toBeVisible();

  // ---- Logout -> Login again (session survives a fresh login) ----
  await logout(page);
  await login(page, merchant);
  await expect(page.getByText('مرحبًا،')).toBeVisible();
});
