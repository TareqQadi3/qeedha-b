import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { PurchasesPage } from '../PurchasesPage';

const hasPermission = vi.fn();

vi.mock('../../state/auth', () => ({
  useAuth: () => ({ hasPermission }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <PurchasesPage />
    </MemoryRouter>,
  );
}

const receivedPurchase = {
  id: 'purchase-1',
  referenceNumber: 'PO-000001',
  status: 'received',
  totalAmount: '115.00',
  currency: 'SAR',
  warehouseId: 'wh-1',
  supplier: { name: 'مورد تجريبي' },
  orderedAt: new Date().toISOString(),
  items: [{ id: 'pitem-1', productId: 'prod-1', productName: 'منتج', quantity: '10', unitCost: '10' }],
  supplierPayments: [
    { id: 'sp-1', amount: '50.00', method: 'transfer', reference: 'TRX-1', createdAt: new Date().toISOString() },
  ],
};

function mockGet(handlers: Record<string, unknown>) {
  return vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
    if (path in handlers) return Promise.resolve(handlers[path]);
    return Promise.resolve([]);
  });
}

describe('PurchasesPage - Milestone 7 supplier payments & purchase returns', () => {
  it('لا يظهر زر التفاصيل إلا لأمر شراء مُستلَم', async () => {
    hasPermission.mockImplementation(() => true);
    mockGet({
      '/purchases': {
        data: [{ ...receivedPurchase, status: 'ordered' }],
        meta: { page: 1, pageSize: 20, total: 1 },
      },
      '/tenancy/warehouses': [],
      '/suppliers': { data: [] },
      '/products': { data: [] },
    });

    renderPage();
    await screen.findByText('PO-000001');
    expect(screen.queryByText('تفاصيل / دفع / مرتجع')).not.toBeInTheDocument();
  });

  it('فتح التفاصيل يعرض الدفعات السابقة والرصيد المستحق، وتسجيل دفعة يستدعي المسار الصحيح', async () => {
    hasPermission.mockImplementation(() => true);
    const postSpy = vi.spyOn(client.api, 'post').mockResolvedValue({});
    mockGet({
      '/purchases': { data: [receivedPurchase], meta: { page: 1, pageSize: 20, total: 1 } },
      '/tenancy/warehouses': [],
      '/suppliers': { data: [] },
      '/products': { data: [] },
      '/purchases/purchase-1': receivedPurchase,
      '/purchases/purchase-1/returns': [],
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByText('تفاصيل / دفع / مرتجع'));

    expect(await screen.findByText(/الرصيد المستحق: 65\.00/)).toBeInTheDocument();
    expect(screen.getByText('TRX-1')).toBeInTheDocument();

    const amountInput = screen.getByLabelText('المبلغ') as HTMLInputElement;
    await user.type(amountInput, '65');
    await user.click(screen.getByRole('button', { name: 'تسجيل الدفعة' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/purchases/purchase-1/payments',
        expect.objectContaining({ amount: 65, method: 'cash' }),
      ),
    );
  });

  it('عضو بلا صلاحية purchases.return لا يرى نموذج تسجيل مرتجع', async () => {
    hasPermission.mockImplementation((key: string) => key !== 'purchases.return');
    mockGet({
      '/purchases': { data: [receivedPurchase], meta: { page: 1, pageSize: 20, total: 1 } },
      '/tenancy/warehouses': [],
      '/suppliers': { data: [] },
      '/products': { data: [] },
      '/purchases/purchase-1': receivedPurchase,
      '/purchases/purchase-1/returns': [],
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByText('تفاصيل / دفع / مرتجع'));
    await screen.findByText(/الرصيد المستحق/);

    expect(screen.queryByText('تسجيل مرتجع مشتريات')).not.toBeInTheDocument();
  });
});
