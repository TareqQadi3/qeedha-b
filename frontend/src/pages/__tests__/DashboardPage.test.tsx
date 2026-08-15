import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { DashboardPage } from '../DashboardPage';

vi.mock('../../state/auth', () => ({
  useAuth: () => ({
    me: { fullName: 'مالك الاختبار' },
    hasPermission: (key: string) => key !== 'suppliers.read',
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  it('only fetches and renders tiles the member has permission for', async () => {
    const getSpy = vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/products') return Promise.resolve({ meta: { total: 5 } });
      if (path === '/inventory/stock-levels') return Promise.resolve({ meta: { total: 2 } });
      if (path === '/customers') return Promise.resolve({ meta: { total: 9 } });
      return Promise.resolve({ meta: { total: 0 } });
    });

    renderPage();

    expect(await screen.findByText('عدد المنتجات')).toBeInTheDocument();
    expect(screen.queryByText('عدد الموردين')).not.toBeInTheDocument();
    await waitFor(() => expect(getSpy).not.toHaveBeenCalledWith('/suppliers', expect.anything()));
  });

  it('still shows tiles from successful requests when one tile fetch fails (Promise.allSettled, not Promise.all)', async () => {
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/products') return Promise.resolve({ meta: { total: 5 } });
      if (path === '/inventory/stock-levels') return Promise.reject(new client.ApiError('خطأ', 500));
      if (path === '/customers') return Promise.resolve({ meta: { total: 9 } });
      return Promise.resolve({ meta: { total: 0 } });
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('تعذّر تحميل بعض المؤشرات')).toBeInTheDocument();
  });
});
