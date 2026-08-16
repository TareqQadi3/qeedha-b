import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '@playwright/test';
import { registerMerchant } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Excel Import Wizard (Milestone 3) - Upload -> Map -> Preview -> Validate
 * -> Confirm, against the real backend/database, using a committed fixture
 * file (frontend/e2e/fixtures/import-products.xlsx: SKU/name/cost/price
 * columns, two valid product rows). Then confirms the imported products are
 * real - they show up on /products through the normal list endpoint.
 */
test('merchant can import products from an Excel file end to end', async ({ page }) => {
  await registerMerchant(page);

  await page.goto('/import');
  await expect(page.getByRole('heading', { name: 'استيراد من Excel' })).toBeVisible();

  const fixturePath = path.join(__dirname, 'fixtures', 'import-products.xlsx');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.getByRole('button', { name: 'رفع الملف ومتابعة' }).click();

  // Mapping screen appears with auto-suggested columns already filled in.
  await expect(page.getByText(/ربط أعمدة الملف/)).toBeVisible();
  await page.getByRole('button', { name: 'حفظ الربط' }).click();

  await page.getByRole('button', { name: 'معاينة' }).click();
  await expect(page.getByText('إجمالي الصفوف: 2')).toBeVisible();

  await page.getByRole('button', { name: 'التحقق من صحة البيانات' }).click();
  await expect(page.getByText(/تم التحقق: 2 صف صالح/)).toBeVisible();

  await page.getByRole('button', { name: /تأكيد الاستيراد/ }).click();
  await expect(page.getByText(/اكتمل الاستيراد: 2 صف تم استيراده بنجاح/)).toBeVisible();

  // The imported products are real - verify through the normal Products list.
  await page.goto('/products');
  await expect(page.getByText('منتج مستورد بلايرايت 1')).toBeVisible();
  await expect(page.getByText('منتج مستورد بلايرايت 2')).toBeVisible();

  // History table on /import reflects the completed job.
  await page.goto('/import');
  await expect(page.getByText('import-products.xlsx')).toBeVisible();
  await expect(page.getByText('مكتمل').first()).toBeVisible();
});
