import { expect, Page } from '@playwright/test';

export function uniqueId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export interface RegisteredMerchant {
  id: string;
  legalName: string;
  ownerEmail: string;
  password: string;
}

/** Fills the registration form and waits for the dashboard - the standard starting point for every golden-path scenario. */
export async function registerMerchant(page: Page): Promise<RegisteredMerchant> {
  const id = uniqueId();
  const merchant: RegisteredMerchant = {
    id,
    legalName: `متجر بلايرايت ${id}`,
    ownerEmail: `pw-owner-${id}@test.qeedha.local`,
    password: 'SuperSecret123',
  };

  await page.goto('/register');
  await page.getByLabel('اسم المنشأة').fill(merchant.legalName);
  await page.getByLabel('اسمك الكامل').fill(`مالك ${id}`);
  await page.getByLabel('البريد الإلكتروني').fill(merchant.ownerEmail);
  await page.getByLabel('كلمة المرور').fill(merchant.password);
  await page.getByRole('button', { name: 'إنشاء المنشأة والبدء' }).click();
  await page.waitForURL('/');
  await expect(page.getByText(`مرحبًا،`)).toBeVisible();

  return merchant;
}

export async function login(page: Page, merchant: RegisteredMerchant) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني أو رقم الجوال').fill(merchant.ownerEmail);
  await page.getByLabel('كلمة المرور').fill(merchant.password);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await page.waitForURL('/');
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await page.waitForURL('/login');
}
