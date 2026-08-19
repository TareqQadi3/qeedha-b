import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminLoginPage } from '../AdminLoginPage';

const login = vi.fn();
const navigate = vi.fn();

vi.mock('../AdminAuthContext', () => ({
  useAdminAuth: () => ({ login }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminLoginPage />
    </MemoryRouter>,
  );
}

describe('AdminLoginPage', () => {
  it('submits admin email/password and navigates to the dashboard on success', async () => {
    login.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('البريد الإلكتروني'), 'admin@test.local');
    await user.type(screen.getByLabelText('كلمة المرور'), 'PlatformAdmin123');
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    expect(login).toHaveBeenCalledWith('admin@test.local', 'PlatformAdmin123');
  });

  it('shows the server error message on failed login', async () => {
    const { ApiError } = await import('../../api/client');
    login.mockRejectedValue(new ApiError('بيانات الدخول غير صحيحة', 401));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('البريد الإلكتروني'), 'admin@test.local');
    await user.type(screen.getByLabelText('كلمة المرور'), 'WrongPassword');
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    expect(await screen.findByText('بيانات الدخول غير صحيحة')).toBeInTheDocument();
  });
});
