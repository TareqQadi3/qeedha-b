import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { InvoicesPage } from '../InvoicesPage';

const hasPermission = vi.fn();

vi.mock('../../state/auth', () => ({
  useAuth: () => ({ hasPermission }),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake') },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <InvoicesPage />
    </MemoryRouter>,
  );
}

describe('InvoicesPage - Milestone 4 QR display', () => {
  it('shows an error banner instead of the list when the member lacks invoices.read', () => {
    hasPermission.mockImplementation(() => false);
    renderPage();
    expect(screen.getByText('لا تملك صلاحية عرض المبيعات والفواتير')).toBeInTheDocument();
  });

  it('only offers a QR button for invoices that actually have a generated QR code, never a fake one', async () => {
    hasPermission.mockImplementation(() => true);
    vi.spyOn(client.api, 'get').mockResolvedValue({
      data: [
        {
          id: 'inv-with-qr',
          invoiceNumber: 'INV-000001',
          status: 'issued',
          totalAmount: '11.50',
          currency: 'SAR',
          issuedAt: new Date().toISOString(),
          customer: null,
          sale: { payments: [{ method: 'cash' }] },
          compliance: { status: 'not_submitted', qrCode: 'ZmFrZS10bHY=' },
        },
        {
          id: 'inv-without-qr',
          invoiceNumber: 'INV-000002',
          status: 'issued',
          totalAmount: '5.00',
          currency: 'SAR',
          issuedAt: new Date().toISOString(),
          customer: null,
          sale: { payments: [{ method: 'cash' }] },
          compliance: { status: 'not_submitted', qrCode: null },
        },
      ],
      meta: { page: 1, pageSize: 20, total: 2 },
    });

    renderPage();

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3)); // header + 2 rows
    const qrButtons = screen.getAllByRole('button', { name: 'عرض QR' });
    expect(qrButtons).toHaveLength(1);

    const user = userEvent.setup();
    await user.click(qrButtons[0]);

    expect(await screen.findByAltText('رمز QR للفاتورة')).toBeInTheDocument();
    expect(screen.getByText(/لم يُرسَل بعد لأي واجهة برمجية خارجية/)).toBeInTheDocument();
  });
});

describe('InvoicesPage - Milestone 7 AR payments & sales returns', () => {
  const creditInvoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-000003',
    status: 'issued',
    totalAmount: '46.00',
    currency: 'SAR',
    issuedAt: new Date().toISOString(),
    customer: { name: 'عميل آجل' },
    sale: {
      id: 'sale-1',
      status: 'completed',
      totalAmount: '46.00',
      items: [{ id: 'item-1', productName: 'منتج تجريبي', quantity: '4' }],
      payments: [{ id: 'pay-1', amount: '20.00', method: 'cash', createdAt: new Date().toISOString() }],
    },
    compliance: null,
  };

  it('لا يظهر زر "تفاصيل" لعملية بيع ملغاة، ويظهر لعملية بيع مكتملة', async () => {
    hasPermission.mockImplementation(() => true);
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/invoices') {
        return Promise.resolve({
          data: [{ ...creditInvoice, sale: { ...creditInvoice.sale, status: 'cancelled' } }],
          meta: { page: 1, pageSize: 20, total: 1 },
        });
      }
      return Promise.resolve([]);
    });

    renderPage();
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2));
    expect(screen.queryByText('تفاصيل / دفع / مرتجع')).not.toBeInTheDocument();
  });

  it('فتح التفاصيل يعرض الرصيد المستحق، وتسجيل دفعة يستدعي المسار الصحيح', async () => {
    hasPermission.mockImplementation(() => true);
    const postSpy = vi.spyOn(client.api, 'post').mockResolvedValue({});
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/invoices') {
        return Promise.resolve({ data: [creditInvoice], meta: { page: 1, pageSize: 20, total: 1 } });
      }
      if (path === '/sales/sale-1/returns') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByText('تفاصيل / دفع / مرتجع'));

    expect(await screen.findByText(/الرصيد المستحق: 26\.00/)).toBeInTheDocument();

    const amountInput = screen.getByLabelText('المبلغ') as HTMLInputElement;
    await user.type(amountInput, '26');
    await user.click(screen.getByRole('button', { name: 'تسجيل الدفعة' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/sales/sale-1/payments',
        expect.objectContaining({ amount: 26, method: 'cash' }),
      ),
    );
  });

  it('عضو بلا صلاحية sales.return لا يرى نموذج تسجيل مرتجع', async () => {
    hasPermission.mockImplementation((key: string) => key !== 'sales.return');
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/invoices') {
        return Promise.resolve({ data: [creditInvoice], meta: { page: 1, pageSize: 20, total: 1 } });
      }
      if (path === '/sales/sale-1/returns') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByText('تفاصيل / دفع / مرتجع'));
    await screen.findByText(/الرصيد المستحق/);

    expect(screen.queryByText('تسجيل مرتجع مبيعات')).not.toBeInTheDocument();
  });
});
