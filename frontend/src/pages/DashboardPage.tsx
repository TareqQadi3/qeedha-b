import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card, PageHeader } from '../components/ui';
import { useAuth } from '../state/auth';

/**
 * Deliberately minimal per docs/ROADMAP.md - Phase 2 shows only metrics with
 * a real data source today (products, low-stock, customers, suppliers).
 * Sales/purchases/expenses/profit tiles are added once those modules exist
 * in later phases - never invented ahead of real data.
 */
export function DashboardPage() {
  const { me } = useAuth();
  const [counts, setCounts] = useState<{ products: number; lowStock: number; customers: number; suppliers: number } | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      const [products, lowStock, customers, suppliers] = await Promise.all([
        api.get('/products', { page: 1, pageSize: 1 }),
        api.get('/inventory/stock-levels', { page: 1, pageSize: 1, lowStockOnly: true }),
        api.get('/customers', { page: 1, pageSize: 1 }),
        api.get('/suppliers', { page: 1, pageSize: 1 }),
      ]);
      setCounts({
        products: products.meta.total,
        lowStock: lowStock.meta.total,
        customers: customers.meta.total,
        suppliers: suppliers.meta.total,
      });
    })();
  }, []);

  const tiles = [
    { label: 'عدد المنتجات', value: counts?.products },
    { label: 'أصناف منخفضة المخزون', value: counts?.lowStock, warn: true },
    { label: 'عدد العملاء', value: counts?.customers },
    { label: 'عدد الموردين', value: counts?.suppliers },
  ];

  return (
    <div>
      <PageHeader title={`مرحبًا، ${me?.fullName ?? ''}`} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <div className="text-sm text-slate-500">{tile.label}</div>
            <div className={`mt-2 text-3xl font-bold ${tile.warn && (tile.value ?? 0) > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {tile.value ?? '...'}
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-400">
        مؤشرات المبيعات والمشتريات والمصروفات والأرباح تُضاف مع المراحل القادمة عندما تتوفر بياناتها الفعلية.
      </p>
    </div>
  );
}
