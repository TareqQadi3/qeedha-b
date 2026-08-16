import { expect, test } from '@playwright/test';
import { uniqueId } from './helpers';

/**
 * Milestone 4 (ZATCA readiness, Phase 1 only) - verifies the QR feature is
 * actually reachable by a real merchant through the real UI, not just
 * wired in the backend: a merchant who enters a VAT number at registration
 * sees a real, renderable QR image on their invoice after a POS sale.
 */
test('a merchant with a VAT number on file sees a real QR code on their invoice', async ({
  page,
}) => {
  const id = uniqueId();
  const productName = `منتج فوترة ${id}`;
  const productSku = `EINV-${id}`;

  await page.goto('/register');
  await page.getByLabel('اسم المنشأة').fill(`متجر الفوترة ${id}`);
  await page.getByLabel('الرقم الضريبي (اختياري)').fill('300000000000003');
  await page.getByLabel('اسمك الكامل').fill(`مالك ${id}`);
  await page.getByLabel('البريد الإلكتروني').fill(`einv-owner-${id}@test.qeedha.local`);
  await page.getByLabel('كلمة المرور').fill('SuperSecret123');
  await page.getByRole('button', { name: 'إنشاء المنشأة والبدء' }).click();
  await page.waitForURL('/');

  await page.goto('/products');
  await page.getByRole('button', { name: '+ منتج جديد' }).click();
  await page.getByLabel('SKU').fill(productSku);
  await page.getByLabel('اسم المنتج').fill(productName);
  await page.getByLabel('سعر التكلفة').fill('5');
  await page.getByLabel('سعر البيع').fill('10');
  await page.getByRole('button', { name: 'حفظ المنتج' }).click();
  await expect(page.getByText(productName)).toBeVisible();

  await page.goto('/inventory');
  await page.getByRole('button', { name: 'رصيد افتتاحي' }).click();
  await page.getByLabel('المنتج').selectOption({ label: `${productName} (${productSku})` });
  await page.getByLabel('الكمية').fill('50');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText(productSku)).toBeVisible();

  await page.goto('/pos');
  await page.getByPlaceholder('ابحث بالاسم أو SKU أو امسح الباركود...').fill(productName);
  await page.getByRole('button', { name: new RegExp(productName) }).click();
  await page.getByRole('button', { name: 'ملء المبلغ كاملًا' }).click();
  await page.getByRole('button', { name: 'إتمام البيع' }).click();
  await expect(page.getByText('تم إتمام البيع بنجاح')).toBeVisible();

  await page.goto('/sales');
  await page.getByRole('button', { name: 'عرض QR' }).first().click();
  const qrImage = page.getByAltText('رمز QR للفاتورة');
  await expect(qrImage).toBeVisible();
  const src = await qrImage.getAttribute('src');
  expect(src).toMatch(/^data:image\/png;base64,/);
  await expect(page.getByText(/لم يُرسَل بعد لأي واجهة برمجية خارجية/)).toBeVisible();
});
