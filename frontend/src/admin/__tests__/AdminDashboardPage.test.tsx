import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminDashboardPage } from '../AdminDashboardPage';
import { adminApi } from '../adminApi';

const logout = vi.fn();

vi.mock('../AdminAuthContext', () => ({
  useAdminAuth: () => ({ admin: { id: 'a1', fullName: 'مدير تجريبي', email: 'admin@test.local' }, logout }),
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
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('AdminDashboardPage', () => {
  it('lists companies across every tenant', async () => {
    vi.spyOn(adminApi, 'get').mockResolvedValue(COMPANIES);

    renderPage();

    await waitFor(() => expect(screen.getByText('متجر تجريبي')).toBeInTheDocument());
    expect(screen.getByText('نشطة')).toBeInTheDocument();
  });

  it('creates a merchant company and shows the owner credentials to hand off', async () => {
    vi.spyOn(adminApi, 'get').mockResolvedValue(COMPANIES);
    const postSpy = vi.spyOn(adminApi, 'post').mockResolvedValue({
      company: { id: 'c2', legalName: 'متجر جديد' },
      owner: { id: 'u2', fullName: 'مالك جديد', email: 'owner2@test.local', mobile: null },
    });

    const user = userEvent.setup();
    renderPage();

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
});
