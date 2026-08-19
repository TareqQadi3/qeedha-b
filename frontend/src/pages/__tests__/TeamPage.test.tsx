import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { TeamPage } from '../TeamPage';

const hasPermission = vi.fn();

vi.mock('../../state/auth', () => ({
  useAuth: () => ({ hasPermission }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <TeamPage />
    </MemoryRouter>,
  );
}

const MEMBERS_RESPONSE = {
  data: [
    {
      membershipId: 'm1',
      membershipStatus: 'active',
      id: 'u1',
      fullName: 'كاشير تجريبي',
      email: null,
      mobile: null,
      username: 'cashier1',
      roles: [{ membershipRoleId: 'mr1', name: 'Cashier', branch: null }],
    },
  ],
  meta: { page: 1, pageSize: 100, total: 1 },
};

function mockList() {
  return vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
    if (path === '/iam/users') return Promise.resolve(MEMBERS_RESPONSE);
    if (path === '/tenancy/branches') return Promise.resolve([]);
    if (path === '/iam/roles') {
      return Promise.resolve([
        { id: 'role-cashier', name: 'Cashier' },
        { id: 'role-accountant', name: 'Accountant' },
        { id: 'role-integration', name: 'Integration' },
      ]);
    }
    return Promise.resolve({});
  });
}

describe('TeamPage', () => {
  it('shows an error banner instead of the team list when the member lacks iam.users.view', () => {
    hasPermission.mockImplementation(() => false);
    renderPage();
    expect(screen.getByText('لا تملك صلاحية عرض الفريق')).toBeInTheDocument();
  });

  it('lists team members with their username-based identifier and roles', async () => {
    hasPermission.mockImplementation((key: string) => key === 'iam.users.view');
    mockList();

    renderPage();

    await waitFor(() => expect(screen.getByText('كاشير تجريبي')).toBeInTheDocument());
    expect(screen.getByText('cashier1')).toBeInTheDocument();
    expect(screen.getByText('Cashier')).toBeInTheDocument();
    // Manage-only actions (create button, add-role) are hidden without iam.users.manage.
    expect(screen.queryByText('+ عضو جديد')).not.toBeInTheDocument();
  });

  it('creates a team member via username + password only, then reloads the list', async () => {
    hasPermission.mockImplementation((key: string) => key === 'iam.users.view' || key === 'iam.users.manage');
    mockList();
    const postSpy = vi.spyOn(client.api, 'post').mockResolvedValue({ user: {}, membership: {} });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('كاشير تجريبي')).toBeInTheDocument());

    await user.click(screen.getByText('+ عضو جديد'));
    // Integration is a non-human system-actor role, never offered here.
    expect(screen.queryByRole('option', { name: 'Integration' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('اسم الموظف'), 'محاسب جديد');
    // These two Field labels also carry a hint span inside the same <label>,
    // so the accessible name is "label + hint" - match by prefix.
    await user.type(screen.getByLabelText(/^اسم المستخدم/), 'accountant1');
    await user.type(screen.getByLabelText(/^كلمة المرور/), 'AccountantPass123');
    await user.selectOptions(screen.getByLabelText('نوع الحساب (الدور)'), 'role-accountant');
    await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/iam/users', {
        fullName: 'محاسب جديد',
        username: 'accountant1',
        password: 'AccountantPass123',
        roleId: 'role-accountant',
        branchId: undefined,
      }),
    );
  });
});
