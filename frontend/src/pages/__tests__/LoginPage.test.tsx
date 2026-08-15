import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { LoginPage } from '../LoginPage';

const login = vi.fn();
const selectTenant = vi.fn();

vi.mock('../../state/auth', () => ({
  useAuth: () => ({ login, selectTenant }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('submits identifier/password and navigates on successful single-tenant login', async () => {
    login.mockResolvedValueOnce({ kind: 'authenticated' });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('البريد الإلكتروني أو رقم الجوال'), 'owner@test.local');
    await user.type(screen.getByLabelText('كلمة المرور'), 'SuperSecret123');
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('owner@test.local', 'SuperSecret123'));
  });

  it('shows a tenant-selection list when login requires it, and completes on pick', async () => {
    login.mockResolvedValueOnce({
      kind: 'select-tenant',
      tenantSelectionToken: 'tok',
      availableCompanies: [
        { companyId: 'c1', legalName: 'متجر الاختبار', tradeName: null },
        { companyId: 'c2', legalName: 'متجر آخر', tradeName: 'اسم تجاري' },
      ],
    });
    selectTenant.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('البريد الإلكتروني أو رقم الجوال'), 'owner@test.local');
    await user.type(screen.getByLabelText('كلمة المرور'), 'SuperSecret123');
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    expect(await screen.findByText('متجر الاختبار')).toBeInTheDocument();
    expect(screen.getByText('متجر آخر')).toBeInTheDocument();

    await user.click(screen.getByText('متجر الاختبار'));
    await waitFor(() => expect(selectTenant).toHaveBeenCalledWith('tok', 'c1'));
  });

  it('shows the server error message on failed login', async () => {
    login.mockRejectedValueOnce(new ApiError('بيانات الدخول غير صحيحة', 401));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('البريد الإلكتروني أو رقم الجوال'), 'owner@test.local');
    await user.type(screen.getByLabelText('كلمة المرور'), 'WrongPassword');
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    expect(await screen.findByText('بيانات الدخول غير صحيحة')).toBeInTheDocument();
  });
});
