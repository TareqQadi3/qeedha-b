import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Select } from '../components/ui';
import { useAuth } from '../state/auth';

interface Warehouse {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface StockRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantityOnHand: string;
  availableQuantity: string;
  isLowStock: boolean;
}

export function InventoryPage() {
  const { hasPermission } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [modalMode, setModalMode] = useState<'adjust' | 'opening' | null>(null);
  const [form, setForm] = useState({ productId: '', quantity: '', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const loadLevels = async (wh: string) => {
    const res = await api.get('/inventory/stock-levels', { warehouseId: wh || undefined, pageSize: 100 });
    setRows(res.data);
  };

  useEffect(() => {
    (async () => {
      setPageLoading(true);
      setPageError(null);
      try {
        const wh = await api.get('/tenancy/warehouses');
        setWarehouses(wh);
        const defaultId = wh[0]?.id ?? '';
        setWarehouseId(defaultId);
        await loadLevels(defaultId);
        const prod = await api.get('/products', { pageSize: 100 });
        setProducts(prod.data);
      } catch (err) {
        setPageError(err instanceof ApiError ? err.message : 'تعذّر تحميل المخزون');
      } finally {
        setPageLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onWarehouseChange = async (id: string) => {
    setWarehouseId(id);
    setPageError(null);
    try {
      await loadLevels(id);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'تعذّر تحميل أرصدة هذا المستودع');
    }
  };

  const openModal = (mode: 'adjust' | 'opening') => {
    setForm({ productId: '', quantity: '', reason: '' });
    setError(null);
    setModalMode(mode);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (modalMode === 'opening') {
        await api.post('/inventory/opening-balance', {
          warehouseId,
          productId: form.productId,
          quantity: Number(form.quantity),
        });
      } else {
        await api.post('/inventory/adjustments', {
          warehouseId,
          productId: form.productId,
          quantityDelta: Number(form.quantity),
          reason: form.reason,
        });
      }
      setModalMode(null);
      await loadLevels(warehouseId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر التنفيذ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="المخزون"
        action={
          hasPermission('inventory.adjust') && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => openModal('opening')}>
                رصيد افتتاحي
              </Button>
              <Button onClick={() => openModal('adjust')}>تسوية مخزون</Button>
            </div>
          )
        }
      />

      <div className="mb-4 max-w-xs">
        <Field label="المستودع">
          <Select value={warehouseId} onChange={(e) => onWarehouseChange(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <ErrorBanner message={pageError} />
      {pageLoading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
      {!pageLoading && (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">SKU</th>
                <th className="py-2">المنتج</th>
                <th className="py-2">الرصيد الحالي</th>
                <th className="py-2">المتاح</th>
                <th className="py-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{r.productSku}</td>
                  <td className="py-2">{r.productName}</td>
                  <td className="py-2">{r.quantityOnHand}</td>
                  <td className="py-2">{r.availableQuantity}</td>
                  <td className="py-2">
                    {r.isLowStock ? (
                      <span className="text-amber-600">منخفض</span>
                    ) : (
                      <span className="text-emerald-600">جيد</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    لا يوجد رصيد مسجَّل في هذا المستودع بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      <Modal
        open={modalMode !== null}
        onClose={() => setModalMode(null)}
        title={modalMode === 'opening' ? 'رصيد افتتاحي' : 'تسوية مخزون'}
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <ErrorBanner message={error} />
          <Field label="المنتج">
            <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} required>
              <option value="">اختر منتجًا</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={modalMode === 'opening' ? 'الكمية' : 'الفرق (موجب للزيادة، سالب للنقصان)'}>
            <Input
              type="number"
              step="0.001"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
            />
          </Field>
          {modalMode === 'adjust' && (
            <Field label="السبب">
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
            </Field>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '...جارٍ الحفظ' : 'حفظ'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
