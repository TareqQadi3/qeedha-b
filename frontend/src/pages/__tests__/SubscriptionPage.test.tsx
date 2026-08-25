import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { SubscriptionPage } from '../SubscriptionPage';

function renderPage() {
  return render(<SubscriptionPage />);
}

const baseMe = {
  status: 'trialing',
  effectiveStatus: 'trialing',
  isRestricted: false,
  trialEndsAt: new Date().toISOString(),
  trialDaysRemaining: 10,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelledAt: null,
  plan: {
    code: 'professional',
    name: 'الاحترافية',
    description: 'لمنشأة متعددة الفروع',
    priceMonthlySar: 299,
    billingInterval: 'monthly',
  },
  features: {
    pos: true,
    inventory: true,
    accounting: true,
    reports: true,
    excel_import: true,
    zatca: true,
    ar_ap: true,
  },
  usage: {
    users: { current: 1, limit: 15 },
    branches: { current: 1, limit: 5 },
    monthlySales: { current: 0, limit: 2000 },
  },
  billingNote: 'إدارة الفوترة والترقية ستكون متاحة قريبًا عبر مركز التحكم في Qeedha.',
};

const basePlans = [
  {
    code: 'starter',
    name: 'الأساسية',
    description: 'مناسبة لمتجر واحد صغير',
    priceMonthlySar: 99,
    billingInterval: 'monthly',
    maxUsers: 3,
    maxBranches: 1,
    maxMonthlySales: 200,
    features: { pos: true, excel_import: false },
  },
  {
    code: 'professional',
    name: 'الاحترافية',
    description: 'لمنشأة متعددة الفروع',
    priceMonthlySar: 299,
    billingInterval: 'monthly',
    maxUsers: 15,
    maxBranches: 5,
    maxMonthlySales: 2000,
    features: { pos: true, excel_import: true },
  },
];

describe('SubscriptionPage', () => {
  it('shows current plan, trial status, features, and usage', async () => {
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/subscriptions/me') return Promise.resolve(baseMe);
      if (path === '/subscriptions/plans') return Promise.resolve(basePlans);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    renderPage();

    expect((await screen.findAllByText('الاحترافية')).length).toBeGreaterThan(0);
    expect(screen.getByText('فترة تجريبية')).toBeInTheDocument();
    expect(screen.getByText(/متبقٍ 10 أيام/)).toBeInTheDocument();
    expect(screen.getAllByText('299.00 ر.س / شهريًا').length).toBeGreaterThan(0);
    expect(screen.getByText('1 / 15')).toBeInTheDocument();
    expect(screen.getByText(baseMe.billingNote)).toBeInTheDocument();
  });

  it('shows a restricted-access banner when the subscription is expired/suspended', async () => {
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/subscriptions/me') {
        return Promise.resolve({ ...baseMe, status: 'expired', effectiveStatus: 'expired', isRestricted: true });
      }
      if (path === '/subscriptions/plans') return Promise.resolve(basePlans);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    renderPage();

    expect(await screen.findByText('منتهي الصلاحية')).toBeInTheDocument();
    expect(screen.getByText(/انتهت صلاحية الاشتراك الحالي أو تم إيقافه/)).toBeInTheDocument();
  });

  it('never renders a payment/checkout affordance - shows the honest "contact support" note instead', async () => {
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/subscriptions/me') return Promise.resolve(baseMe);
      if (path === '/subscriptions/plans') return Promise.resolve(basePlans);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    renderPage();

    await screen.findAllByText('الاحترافية');
    expect(screen.queryByRole('button', { name: /دفع|ترقية الآن|Pay|Checkout/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/تواصل مع الدعم/).length).toBeGreaterThan(0);
  });

  it('shows an error banner when the subscription request fails', async () => {
    vi.spyOn(client.api, 'get').mockRejectedValue(new client.ApiError('تعذّر تحميل بيانات الاشتراك', 500));

    renderPage();

    expect(await screen.findByText('تعذّر تحميل بيانات الاشتراك')).toBeInTheDocument();
  });

  it('shows Phase 13 per-role usage (warehouses/cashiers/accountants/managers) when present', async () => {
    const meWithRoleUsage = {
      ...baseMe,
      usage: {
        ...baseMe.usage,
        warehouses: { current: 1, limit: 2 },
        cashiers: { current: 2, limit: 6 },
        accountants: { current: 1, limit: 1 },
        managers: { current: 0, limit: 1 },
      },
    };
    const plansWithRoleLimits = basePlans.map((p) => ({
      ...p,
      maxWarehouses: 2,
      maxCashiers: 6,
      maxAccountants: 1,
      maxManagers: 1,
    }));
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/subscriptions/me') return Promise.resolve(meWithRoleUsage);
      if (path === '/subscriptions/plans') return Promise.resolve(plansWithRoleLimits);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    renderPage();

    expect(await screen.findByText('2 / 6')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByText('0 / 1')).toBeInTheDocument();
    expect(screen.getAllByText(/الفروع:.*نقاط البيع:.*المحاسبون:.*المدراء:.*المخازن:/).length).toBeGreaterThan(0);
  });
});
