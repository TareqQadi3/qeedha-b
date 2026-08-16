import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { ReceivablesPayablesPage } from '../ReceivablesPayablesPage';

const hasPermission = vi.fn();

vi.mock('../../state/auth', () => ({
  useAuth: () => ({ hasPermission }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ReceivablesPayablesPage />
    </MemoryRouter>,
  );
}

describe('ReceivablesPayablesPage - AR/AP subledger', () => {
  it('shows an error banner when the member has neither accounting.ar.view nor accounting.ap.view', () => {
    hasPermission.mockImplementation(() => false);
    renderPage();
    expect(screen.getByText('لا تملك صلاحية عرض ذمم العملاء أو الموردين')).toBeInTheDocument();
  });

  it('offers only the AP tab when the member lacks accounting.ar.view', () => {
    hasPermission.mockImplementation((key: string) => key === 'accounting.ap.view');
    vi.spyOn(client.api, 'get').mockResolvedValue([]);
    renderPage();
    expect(screen.queryByRole('button', { name: 'ذمم العملاء (AR)' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذمم الموردين (AP)' })).toBeInTheDocument();
  });

  it('AR tab shows the documented empty-state explanation (no credit-sale flow exists)', async () => {
    hasPermission.mockImplementation(() => true);
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/accounting/ar/customers') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    expect(
      await screen.findByText('لا توجد أرصدة عملاء - النظام حاليًا لا يدعم البيع الآجل (كل عملية بيع تُدفع بالكامل عند إتمامها)'),
    ).toBeInTheDocument();
  });

  it('AP tab lists supplier balances and opens a statement modal on request', async () => {
    hasPermission.mockImplementation(() => true);
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/accounting/ap/suppliers') {
        return Promise.resolve([{ supplierId: 'sup-1', supplierName: 'مورد الأول', balance: 500 }]);
      }
      if (path === '/accounting/ap/suppliers/sup-1') {
        return Promise.resolve({
          balance: 500,
          transactions: [
            { date: new Date().toISOString(), description: 'شراء', debit: 0, credit: 500, runningBalance: 500 },
          ],
        });
      }
      return Promise.resolve([]);
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'ذمم الموردين (AP)' }));

    expect(await screen.findByText('مورد الأول')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'كشف الحساب' }));

    await waitFor(() => expect(screen.getByText('شراء')).toBeInTheDocument());
    expect(screen.getByText('الرصيد: 500.00')).toBeInTheDocument();
  });

  it('shows an error banner when the balances request fails', async () => {
    hasPermission.mockImplementation(() => true);
    vi.spyOn(client.api, 'get').mockRejectedValue(new client.ApiError('تعذّر تحميل ذمم العملاء', 500));

    renderPage();

    expect(await screen.findByText('تعذّر تحميل ذمم العملاء')).toBeInTheDocument();
  });
});
