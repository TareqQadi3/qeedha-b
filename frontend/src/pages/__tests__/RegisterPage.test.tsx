import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { RegisterPage } from '../RegisterPage';

const refreshMe = vi.fn();
const navigate = vi.fn();

vi.mock('../../state/auth', () => ({
  useAuth: () => ({ refreshMe }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

describe('RegisterPage', () => {
  it('submits company/owner details and completes registration on success', async () => {
    const postSpy = vi.spyOn(client.api, 'post').mockResolvedValueOnce({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    const setSessionSpy = vi.spyOn(client, 'setSession').mockImplementation(() => undefined);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('اسم المنشأة'), 'متجر الاختبار');
    await user.type(screen.getByLabelText('اسمك الكامل'), 'مالك الاختبار');
    await user.type(screen.getByLabelText('البريد الإلكتروني'), 'owner@test.local');
    await user.type(screen.getByLabelText('كلمة المرور'), 'SuperSecret123');
    await user.click(screen.getByRole('button', { name: 'إنشاء المنشأة والبدء' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/auth/register-company',
        expect.objectContaining({
          legalName: 'متجر الاختبار',
          ownerFullName: 'مالك الاختبار',
          ownerEmail: 'owner@test.local',
          password: 'SuperSecret123',
        }),
        true,
      ),
    );
    await waitFor(() => expect(setSessionSpy).toHaveBeenCalledWith('access', 'refresh'));
    await waitFor(() => expect(refreshMe).toHaveBeenCalled());

    // Lands on the success confirmation screen (Website phase) rather than
    // navigating immediately - the account is already usable, this just
    // tells the merchant a verification email was sent.
    expect(await screen.findByText('تم إنشاء منشأتك بنجاح')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'الدخول إلى لوحة التحكم' }));
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows the server error message on failed registration', async () => {
    vi.spyOn(client.api, 'post').mockRejectedValueOnce(
      new client.ApiError('البريد الإلكتروني مستخدم بالفعل', 409),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('اسم المنشأة'), 'متجر الاختبار');
    await user.type(screen.getByLabelText('اسمك الكامل'), 'مالك الاختبار');
    await user.type(screen.getByLabelText('البريد الإلكتروني'), 'owner@test.local');
    await user.type(screen.getByLabelText('كلمة المرور'), 'SuperSecret123');
    await user.click(screen.getByRole('button', { name: 'إنشاء المنشأة والبدء' }));

    expect(await screen.findByText('البريد الإلكتروني مستخدم بالفعل')).toBeInTheDocument();
  });
});
