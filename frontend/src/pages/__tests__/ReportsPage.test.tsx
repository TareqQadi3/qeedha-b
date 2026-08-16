import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { ReportsPage } from '../ReportsPage';

const hasPermission = vi.fn();

vi.mock('../../state/auth', () => ({
  useAuth: () => ({ hasPermission }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  );
}

describe('ReportsPage - Trial Balance / General Ledger / P&L / Balance Sheet', () => {
  it('shows an error banner instead of the report tabs when the member lacks accounting.reports.view', () => {
    hasPermission.mockImplementation(() => false);
    renderPage();
    expect(screen.getByText('لا تملك صلاحية عرض التقارير المحاسبية')).toBeInTheDocument();
  });

  it('loads and renders the Trial Balance with a balanced totals row', async () => {
    hasPermission.mockImplementation(() => true);
    vi.spyOn(client.api, 'get').mockResolvedValue({
      rows: [
        { accountId: 'a1', accountCode: '1000', accountName: 'الصندوق', totalDebit: 100, totalCredit: 0, netBalance: 100 },
      ],
      totals: { totalDebit: 100, totalCredit: 100, isBalanced: true },
      range: {},
    });

    renderPage();

    expect(await screen.findByText('الصندوق')).toBeInTheDocument();
    expect(screen.getByText('متوازن')).toBeInTheDocument();
  });

  it('shows an empty-state row when the Trial Balance has no rows in range', async () => {
    hasPermission.mockImplementation(() => true);
    vi.spyOn(client.api, 'get').mockResolvedValue({
      rows: [],
      totals: { totalDebit: 0, totalCredit: 0, isBalanced: true },
      range: {},
    });

    renderPage();

    expect(await screen.findByText('لا توجد حركات محاسبية في هذا المدى')).toBeInTheDocument();
  });

  it('shows an error banner when the Trial Balance request fails', async () => {
    hasPermission.mockImplementation(() => true);
    vi.spyOn(client.api, 'get').mockRejectedValue(new client.ApiError('تعذّر تحميل ميزان المراجعة', 500));

    renderPage();

    expect(await screen.findByText('تعذّر تحميل ميزان المراجعة')).toBeInTheDocument();
  });

  it('General Ledger tab loads accounts, then fetches the ledger for the first account with a running balance', async () => {
    hasPermission.mockImplementation(() => true);
    const getSpy = vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/accounting/accounts') {
        return Promise.resolve([{ id: 'acc-1', code: '1000', name: 'الصندوق', type: 'asset' }]);
      }
      if (path === '/accounting/reports/general-ledger') {
        return Promise.resolve({
          account: { id: 'acc-1', code: '1000', name: 'الصندوق' },
          openingBalance: 50,
          closingBalance: 150,
          lines: [
            { date: new Date().toISOString(), referenceType: 'Sale', description: 'بيع', debit: 100, credit: 0, runningBalance: 150 },
          ],
          range: {},
        });
      }
      return Promise.resolve({});
    });

    renderPage();
    await screen.getByRole('button', { name: 'دفتر الأستاذ' }).click();

    await waitFor(() =>
      expect(getSpy).toHaveBeenCalledWith(
        '/accounting/reports/general-ledger',
        expect.objectContaining({ accountId: 'acc-1' }),
      ),
    );
    expect(await screen.findByText(/الرصيد الافتتاحي: 50/)).toBeInTheDocument();
    expect(screen.getByText(/الرصيد الختامي: 150/)).toBeInTheDocument();
  });

  it('Profit & Loss tab renders revenue, expenses, and net profit', async () => {
    hasPermission.mockImplementation(() => true);
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/accounting/reports/profit-and-loss') {
        return Promise.resolve({
          revenue: [{ accountId: 'r1', accountName: 'إيرادات المبيعات', amount: 200 }],
          expenses: [{ accountId: 'e1', accountName: 'مصروفات تشغيلية', amount: 50 }],
          totalRevenue: 200,
          totalExpense: 50,
          netProfit: 150,
          range: {},
        });
      }
      return Promise.resolve({});
    });

    renderPage();
    await screen.getByRole('button', { name: 'الأرباح والخسائر' }).click();

    expect(await screen.findByText('إيرادات المبيعات')).toBeInTheDocument();
    expect(screen.getByText('مصروفات تشغيلية')).toBeInTheDocument();
    expect(screen.getByText('150.00')).toBeInTheDocument();
  });

  it('Balance Sheet tab marks the unclosed-retained-earnings line as computed and shows balance status', async () => {
    hasPermission.mockImplementation(() => true);
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/accounting/reports/balance-sheet') {
        return Promise.resolve({
          asOfDate: new Date().toISOString(),
          assets: [{ accountId: 'a1', accountName: 'الصندوق', balance: 300 }],
          liabilities: [],
          equity: [
            { accountId: 'eq1', accountName: 'رأس المال', balance: 150 },
            { accountId: null, accountName: 'الأرباح المرحّلة غير المقفلة', balance: 150, computed: true },
          ],
          totals: { totalAssets: 300, totalLiabilities: 0, totalEquity: 300, isBalanced: true },
        });
      }
      return Promise.resolve({});
    });

    renderPage();
    await screen.getByRole('button', { name: 'الميزانية العمومية' }).click();

    expect(await screen.findByText('الأرباح المرحّلة غير المقفلة')).toBeInTheDocument();
    expect(screen.getByText('(محسوب، غير مُرحَّل بقيد)')).toBeInTheDocument();
    expect(screen.getByText('الميزانية متوازنة')).toBeInTheDocument();
  });
});
