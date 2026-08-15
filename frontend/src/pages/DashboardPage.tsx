import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { OnboardingChecklist } from '../components/OnboardingChecklist';
import { Card, ErrorBanner, PageHeader } from '../components/ui';
import { useAuth } from '../state/auth';

interface Tile {
  key: 'products' | 'lowStock' | 'customers' | 'suppliers';
  label: string;
  permission: string;
  request: () => Promise<any>;
  extract: (res: any) => number;
  warn?: boolean;
}

const TILES: Tile[] = [
  {
    key: 'products',
    label: 'عدد المنتجات',
    permission: 'products.read',
    request: () => api.get('/products', { page: 1, pageSize: 1 }),
    extract: (res) => res.meta.total,
  },
  {
    key: 'lowStock',
    label: 'أصناف منخفضة المخزون',
    permission: 'inventory.read',
    request: () => api.get('/inventory/stock-levels', { page: 1, pageSize: 1, lowStockOnly: true }),
    extract: (res) => res.meta.total,
    warn: true,
  },
  {
    key: 'customers',
    label: 'عدد العملاء',
    permission: 'customers.read',
    request: () => api.get('/customers', { page: 1, pageSize: 1 }),
    extract: (res) => res.meta.total,
  },
  {
    key: 'suppliers',
    label: 'عدد الموردين',
    permission: 'suppliers.read',
    request: () => api.get('/suppliers', { page: 1, pageSize: 1 }),
    extract: (res) => res.meta.total,
  },
];

/**
 * Deliberately minimal per docs/ROADMAP.md - Phase 2 shows only metrics with
 * a real data source today (products, low-stock, customers, suppliers).
 * Sales/purchases/expenses/profit tiles are added once those modules exist
 * in later phases - never invented ahead of real data.
 *
 * Each tile is gated by its own permission and fetched independently
 * (Promise.allSettled, not Promise.all) - a member missing one permission
 * (e.g. a Cashier without customers.read) still sees the tiles they can
 * access instead of the whole dashboard silently failing.
 */
export function DashboardPage() {
  const { me, hasPermission } = useAuth();
  const [values, setValues] = useState<Partial<Record<Tile['key'], number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const visibleTiles = TILES.filter((t) => hasPermission(t.permission));

  useEffect(() => {
    if (visibleTiles.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.allSettled(visibleTiles.map((t) => t.request())).then((results) => {
      const next: Partial<Record<Tile['key'], number>> = {};
      let anyFailed = false;
      results.forEach((result, i) => {
        const tile = visibleTiles[i];
        if (result.status === 'fulfilled') {
          next[tile.key] = tile.extract(result.value);
        } else {
          anyFailed = true;
        }
      });
      setValues(next);
      setError(anyFailed ? 'تعذّر تحميل بعض المؤشرات' : null);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader title={`مرحبًا، ${me?.fullName ?? ''}`} />
      <OnboardingChecklist />
      <ErrorBanner message={error} />
      {visibleTiles.length === 0 ? (
        <div className="py-6 text-center text-slate-400">لا توجد مؤشرات متاحة لصلاحياتك الحالية</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {visibleTiles.map((tile) => (
            <Card key={tile.key}>
              <div className="text-sm text-slate-500">{tile.label}</div>
              <div
                className={`mt-2 text-3xl font-bold ${
                  tile.warn && (values[tile.key] ?? 0) > 0 ? 'text-amber-600' : 'text-slate-800'
                }`}
              >
                {loading ? '...' : (values[tile.key] ?? '—')}
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-6 text-sm text-slate-400">
        مؤشرات المبيعات والمشتريات والمصروفات والأرباح تُضاف مع المراحل القادمة عندما تتوفر بياناتها الفعلية.
      </p>
    </div>
  );
}
