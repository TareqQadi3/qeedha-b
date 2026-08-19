import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  averageCost: string;
  inventoryValue: number;
  isLowStock: boolean;
}

// Western digits, matching every other page's money display - see ReportsPage.tsx for rationale.
const money = (n: number | string) => Number(n).toFixed(2);

export function InventoryPage() {
  const { t } = useTranslation('inventory');
  const { hasPermission } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [modalMode, setModalMode] = useState<'adjust' | 'opening' | null>(null);
  const [form, setForm] = useState({ productId: '', quantity: '', reason: '', unitCost: '' });
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
        setPageError(err instanceof ApiError ? err.message : t('errors.loadFailed'));
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
      setPageError(err instanceof ApiError ? err.message : t('errors.warehouseLoadFailed'));
    }
  };

  const openModal = (mode: 'adjust' | 'opening') => {
    setForm({ productId: '', quantity: '', reason: '', unitCost: '' });
    setError(null);
    setModalMode(mode);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const unitCost = form.unitCost !== '' ? Number(form.unitCost) : undefined;
      if (modalMode === 'opening') {
        await api.post('/inventory/opening-balance', {
          warehouseId,
          productId: form.productId,
          quantity: Number(form.quantity),
          ...(unitCost !== undefined ? { unitCost } : {}),
        });
      } else {
        await api.post('/inventory/adjustments', {
          warehouseId,
          productId: form.productId,
          quantityDelta: Number(form.quantity),
          reason: form.reason,
          ...(unitCost !== undefined && Number(form.quantity) > 0 ? { unitCost } : {}),
        });
      }
      setModalMode(null);
      await loadLevels(warehouseId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.actionFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('title')}
        action={
          hasPermission('inventory.adjust') && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => openModal('opening')}>
                {t('actions.openingBalance')}
              </Button>
              <Button onClick={() => openModal('adjust')}>{t('actions.adjustStock')}</Button>
            </div>
          )
        }
      />

      <div className="mb-4 max-w-xs">
        <Field label={t('fields.warehouse')}>
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
      {pageLoading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
      {!pageLoading && (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">{t('table.sku')}</th>
                <th className="py-2">{t('table.product')}</th>
                <th className="py-2">{t('table.quantityOnHand')}</th>
                <th className="py-2">{t('table.available')}</th>
                <th className="py-2">{t('table.averageCost')}</th>
                <th className="py-2">{t('table.inventoryValue')}</th>
                <th className="py-2">{t('table.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{r.productSku}</td>
                  <td className="py-2">{r.productName}</td>
                  <td className="py-2">{r.quantityOnHand}</td>
                  <td className="py-2">{r.availableQuantity}</td>
                  <td className="py-2 text-slate-500">{money(r.averageCost)}</td>
                  <td className="py-2 font-medium">{money(r.inventoryValue)}</td>
                  <td className="py-2">
                    {r.isLowStock ? (
                      <span className="text-amber-600">{t('status.low')}</span>
                    ) : (
                      <span className="text-emerald-600">{t('status.good')}</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    {t('table.empty')}
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
        title={modalMode === 'opening' ? t('actions.openingBalance') : t('actions.adjustStock')}
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <ErrorBanner message={error} />
          <Field label={t('fields.product')}>
            <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} required>
              <option value="">{t('fields.selectProduct')}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={modalMode === 'opening' ? t('fields.quantity') : t('fields.quantityDelta')}>
            <Input
              type="number"
              step="0.001"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
            />
          </Field>
          {(modalMode === 'opening' || (modalMode === 'adjust' && Number(form.quantity) > 0)) && (
            <Field label={t('fields.unitCost')}>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.unitCost}
                onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
              />
            </Field>
          )}
          {modalMode === 'adjust' && (
            <Field label={t('fields.reason')}>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
            </Field>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('actions.saving') : t('actions.save')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
