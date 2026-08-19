import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminDashboardPage } from '../AdminDashboardPage';
import { adminApi } from '../adminApi';

const logout = vi.fn();
const useAdminAuthMock = vi.fn(() => ({
  admin: { id: 'a1', fullName: 'مدير تجريبي', email: 'admin@test.local', role: 'admin' },
  logout,
}));

vi.mock('../AdminAuthContext', () => ({
  useAdminAuth: () => useAdminAuthMock(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminDashboardPage />
    </MemoryRouter>,
  );
}

const COMPANIES = [
  {
    id: 'c1',
    legalName: 'متجر تجريبي',
    tradeName: null,
    vatNumber: null,
    countryCode: 'SA',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    subscription: { status: 'trialing', trialEndsAt: '2026-02-01T00:00:00.000Z', plan: { code: 'starter', name: 'الأساسية', products: ['qeedha_b'] } },
  },
];

const OVERVIEW = {
  totalMerchants: 1,
  activeMerchants: 1,
  trialSubscriptions: 1,
  expiredTrials: 0,
  activeSubscriptions: 0,
  suspendedSubscriptions: 0,
  cancelledSubscriptions: 0,
  qeedhaBSubscribers: 1,
  qeedhaSubscribers: 0,
  combinedSubscribers: 0,
  totalAffiliates: 0,
  totalCommissionSar: 0,
  pendingCommissionSar: 0,
  totalApplications: 0,
  newApplications: 0,
};

function mockGetByPath() {
  return vi.spyOn(adminApi, 'get').mockImplementation((path: string) => {
    if (path === '/platform-admin/overview') return Promise.resolve(OVERVIEW);
    if (path === '/platform-admin/companies') return Promise.resolve(COMPANIES);
    if (path === '/platform-admin/plans') return Promise.resolve([{ code: 'starter', name: 'الأساسية' }]);
    return Promise.resolve([]);
  });
}

describe('AdminDashboardPage', () => {
  it('shows the overview tab by default, then lists companies across every tenant on the Merchants tab', async () => {
    mockGetByPath();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('إجمالي المنشآت')).toBeInTheDocument()); // overview metric label

    await user.click(screen.getByRole('button', { name: 'المنشآت' }));
    await waitFor(() => expect(screen.getByText('متجر تجريبي')).toBeInTheDocument());
    expect(screen.getByText('نشطة')).toBeInTheDocument();
  });

  it('creates a merchant company and shows the owner credentials to hand off', async () => {
    mockGetByPath();
    const postSpy = vi.spyOn(adminApi, 'post').mockResolvedValue({
      company: { id: 'c2', legalName: 'متجر جديد' },
      owner: { id: 'u2', fullName: 'مالك جديد', email: 'owner2@test.local', mobile: null },
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'المنشآت' }));
    await waitFor(() => expect(screen.getByText('متجر تجريبي')).toBeInTheDocument());

    await user.click(screen.getByText('+ منشأة جديدة'));
    await user.type(screen.getByLabelText('الاسم القانوني للمنشأة'), 'متجر جديد');
    await user.type(screen.getByLabelText('اسم مالك المنشأة'), 'مالك جديد');
    await user.type(screen.getByLabelText('البريد الإلكتروني للمالك'), 'owner2@test.local');
    await user.type(screen.getByLabelText(/^كلمة مرور المالك/), 'OwnerPassword123');
    await user.click(screen.getByRole('button', { name: 'إنشاء المنشأة' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/platform-admin/companies', {
        legalName: 'متجر جديد',
        tradeName: undefined,
        vatNumber: undefined,
        ownerFullName: 'مالك جديد',
        ownerEmail: 'owner2@test.local',
        password: 'OwnerPassword123',
      }),
    );

    // The credentials hand-off modal shows what was just created.
    expect(await screen.findByText('owner2@test.local')).toBeInTheDocument();
    expect(screen.getByText('OwnerPassword123')).toBeInTheDocument();
  });

  it('hides admin-only tabs (Plans/Markets/Staff) for a narrower staff role', async () => {
    useAdminAuthMock.mockReturnValue({
      admin: { id: 'a2', fullName: 'موظف دعم', email: 'support@test.local', role: 'support' },
      logout,
    });
    mockGetByPath();

    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'المنشآت' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'الباقات' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'الأسواق' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'الموظفون' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'طلبات التوظيف' })).toBeInTheDocument();
  });
});
