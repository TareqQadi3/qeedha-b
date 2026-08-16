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
