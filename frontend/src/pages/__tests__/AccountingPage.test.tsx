import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { AccountingPage } from '../AccountingPage';

const hasPermission = vi.fn();

vi.mock('../../state/auth', () => ({
  useAuth: () => ({ hasPermission }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountingPage />
    </MemoryRouter>,
  );
}

function mockGet(handlers: Record<string, unknown>) {
  return vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
    if (path in handlers) return Promise.resolve(handlers[path]);
    return Promise.resolve({});
  });
}

describe('AccountingPage - Opening Balances / Fiscal Periods tabs', () => {
  it('shows an error banner instead of the page when the member lacks accounting.read', () => {
    hasPermission.mockImplementation(() => false);
    renderPage();
    expect(screen.getByText('لا تملك صلاحية عرض الحسابات')).toBeInTheDocument();
  });

  it('Opening Balances tab shows the empty state, and only offers "record" when accounting.opening_balance.manage is granted', async () => {
    hasPermission.mockImplementation(
      (key: string) => key === 'accounting.read' || key === 'accounting.opening_balance.manage',
    );
    mockGet({
      '/accounting/accounts': [],
      '/accounting/journal-entries': { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      '/accounting/opening-balance': null,
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'الأرصدة الافتتاحية' }));

    expect(await screen.findByText('لا يوجد رصيد افتتاحي مُرحَّل لهذه المنشأة بعد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ تسجيل رصيد افتتاحي' })).toBeInTheDocument();
  });

  it('Opening Balances tab hides the "record" action without accounting.opening_balance.manage', async () => {
    hasPermission.mockImplementation((key: string) => key === 'accounting.read');
    mockGet({
      '/accounting/accounts': [],
      '/accounting/journal-entries': { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      '/accounting/opening-balance': null,
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'الأرصدة الافتتاحية' }));

    await screen.findByText('لا يوجد رصيد افتتاحي مُرحَّل لهذه المنشأة بعد');
    expect(screen.queryByRole('button', { name: '+ تسجيل رصيد افتتاحي' })).not.toBeInTheDocument();
  });

  it('Opening Balances tab renders an existing balance with its lines and a reverse action', async () => {
    hasPermission.mockImplementation(
      (key: string) => key === 'accounting.read' || key === 'accounting.opening_balance.manage',
    );
    mockGet({
      '/accounting/accounts': [],
      '/accounting/journal-entries': { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      '/accounting/opening-balance': {
        id: 'ob-1',
        postedAt: new Date().toISOString(),
        lines: [{ id: 'l1', debit: '1000.00', credit: '0.00', account: { code: '1000', name: 'الصندوق' } }],
      },
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'الأرصدة الافتتاحية' }));

    expect(await screen.findByText('الصندوق')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'عكس الرصيد الافتتاحي' })).toBeInTheDocument();
  });

  it('Fiscal Periods tab lists periods and only offers create/close-reopen with accounting.period.manage', async () => {
    hasPermission.mockImplementation(
      (key: string) => key === 'accounting.read' || key === 'accounting.period.manage',
    );
    mockGet({
      '/accounting/accounts': [],
      '/accounting/journal-entries': { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      '/accounting/fiscal-periods': [
        { id: 'p1', name: 'يناير', startDate: '2026-01-01', endDate: '2026-01-31', status: 'open' },
      ],
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'الفترات المحاسبية' }));

    expect(await screen.findByText('يناير')).toBeInTheDocument();
    expect(screen.getByText('مفتوحة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ فترة محاسبية جديدة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إقفال' })).toBeInTheDocument();
  });

  it('Fiscal Periods tab shows the empty state and no manage actions without accounting.period.manage', async () => {
    hasPermission.mockImplementation((key: string) => key === 'accounting.read');
    mockGet({
      '/accounting/accounts': [],
      '/accounting/journal-entries': { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      '/accounting/fiscal-periods': [],
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'الفترات المحاسبية' }));

    expect(await screen.findByText('لا توجد فترات محاسبية بعد')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ فترة محاسبية جديدة' })).not.toBeInTheDocument();
  });

  it('closing an open period calls the close endpoint and refreshes the list', async () => {
    hasPermission.mockImplementation(
      (key: string) => key === 'accounting.read' || key === 'accounting.period.manage',
    );
    mockGet({
      '/accounting/accounts': [],
      '/accounting/journal-entries': { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      '/accounting/fiscal-periods': [
        { id: 'p1', name: 'يناير', startDate: '2026-01-01', endDate: '2026-01-31', status: 'open' },
      ],
    });
    const postSpy = vi.spyOn(client.api, 'post').mockResolvedValue({});

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'الفترات المحاسبية' }));
    await screen.findByText('يناير');
    await user.click(screen.getByRole('button', { name: 'إقفال' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/accounting/fiscal-periods/p1/close'));
  });
});
