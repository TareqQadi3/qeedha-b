import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { InventoryPage } from '../InventoryPage';

const hasPermission = vi.fn();

vi.mock('../../state/auth', () => ({
  useAuth: () => ({ hasPermission }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <InventoryPage />
    </MemoryRouter>,
  );
}

function mockGet(handlers: Record<string, unknown>) {
  return vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
    if (path in handlers) return Promise.resolve(handlers[path]);
    return Promise.resolve({});
  });
}

describe('InventoryPage - Milestone 6 average cost / inventory value', () => {
  it('shows averageCost and inventoryValue columns for each stock row', async () => {
    hasPermission.mockImplementation(() => false);
    mockGet({
      '/tenancy/warehouses': [{ id: 'wh-1', name: 'المستودع الرئيسي' }],
      '/inventory/stock-levels': {
        data: [
          {
            id: 'sl-1',
            productId: 'p-1',
            productName: 'منتج تجريبي',
            productSku: 'SKU-1',
            quantityOnHand: '20',
            availableQuantity: '20',
            averageCost: '15.0000',
            inventoryValue: 300,
            isLowStock: false,
          },
        ],
        meta: { total: 1 },
      },
      '/products': { data: [] },
    });

    renderPage();

    expect(await screen.findByText('300.00')).toBeInTheDocument();
    expect(screen.getByText('15.00')).toBeInTheDocument();
  });

  it('shows the empty state when a warehouse has no stock levels yet', async () => {
    hasPermission.mockImplementation(() => false);
    mockGet({
      '/tenancy/warehouses': [{ id: 'wh-1', name: 'المستودع الرئيسي' }],
      '/inventory/stock-levels': { data: [], meta: { total: 0 } },
      '/products': { data: [] },
    });

    renderPage();

    expect(await screen.findByText('لا يوجد رصيد مسجَّل في هذا المستودع بعد')).toBeInTheDocument();
  });

  it('only offers opening-balance/adjustment actions with inventory.adjust, and lets a unit cost be entered for an opening balance', async () => {
    hasPermission.mockImplementation((key: string) => key === 'inventory.adjust');
    const postSpy = vi.spyOn(client.api, 'post').mockResolvedValue({});
    mockGet({
      '/tenancy/warehouses': [{ id: 'wh-1', name: 'المستودع الرئيسي' }],
      '/inventory/stock-levels': { data: [], meta: { total: 0 } },
      '/products': { data: [{ id: 'p-1', name: 'منتج تجريبي', sku: 'SKU-1' }] },
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByRole('button', { name: 'رصيد افتتاحي' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'رصيد افتتاحي' }));

    await user.selectOptions(screen.getByLabelText('المنتج'), 'p-1');
    await user.type(screen.getByLabelText('الكمية'), '10');
    await user.type(screen.getByLabelText(/تكلفة الوحدة/), '12.5');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/inventory/opening-balance',
        expect.objectContaining({ productId: 'p-1', quantity: 10, unitCost: 12.5 }),
      ),
    );
  });

  it('hides the unit-cost field for a decreasing adjustment (negative quantityDelta)', async () => {
    hasPermission.mockImplementation((key: string) => key === 'inventory.adjust');
    mockGet({
      '/tenancy/warehouses': [{ id: 'wh-1', name: 'المستودع الرئيسي' }],
      '/inventory/stock-levels': { data: [], meta: { total: 0 } },
      '/products': { data: [{ id: 'p-1', name: 'منتج تجريبي', sku: 'SKU-1' }] },
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'تسوية مخزون' }));
    await user.type(screen.getByLabelText(/الفرق/), '-3');

    expect(screen.queryByLabelText(/تكلفة الوحدة/)).not.toBeInTheDocument();
  });
});
