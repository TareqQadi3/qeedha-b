import { expect, test } from '@playwright/test';
import { registerMerchant, uniqueId } from './helpers';

/**
 * SaaS isolation check (Milestone 2 "SaaS Architecture" §24): Company A's
 * data must never be visible to Company B, verified end-to-end through the
 * real UI + API + database - not just at the API layer (already covered by
 * backend/test/*.e2e-spec.ts "IDOR"/"RLS" suites). This is the browser-level
 * confirmation that the isolation actually holds for a real logged-in user.
 */
test('a product created by one merchant is invisible to a different merchant', async ({ page }) => {
  const id = uniqueId();
  const productName = `منتج معزول ${id}`;

  await registerMerchant(page);
  await page.goto('/products');
  await page.getByRole('button', { name: '+ منتج جديد' }).click();
  await page.getByLabel('SKU').fill(`ISO-${id}`);
  await page.getByLabel('اسم المنتج').fill(productName);
  await page.getByLabel('سعر التكلفة').fill('5');
  await page.getByLabel('سعر البيع').fill('10');
  await page.getByRole('button', { name: 'حفظ المنتج' }).click();
  await expect(page.getByText(productName)).toBeVisible();

  // A fresh merchant (company B) - registerMerchant navigates to /register,
  // which logs company A out implicitly by overwriting the stored session.
  await registerMerchant(page);
  await page.goto('/products');
  await page.getByPlaceholder('ابحث بالاسم أو SKU أو الباركود').fill(productName);
  await page.getByRole('button', { name: 'بحث' }).click();
  await expect(page.getByText('لا توجد منتجات بعد')).toBeVisible();
  await expect(page.getByText(productName)).not.toBeVisible();
});
