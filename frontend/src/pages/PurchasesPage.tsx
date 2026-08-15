import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Modal,
  PageHeader,
  Pagination,
  Select,
} from '../components/ui';
import { useAuth } from '../state/auth';

interface Supplier {
  id: string;
  name: string;
}

interface Warehouse {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  costPrice: string;
}

interface PurchaseItemRow {
  productId: string;
  productName: string;
  quantity: string;
  unitCost: string;
}

interface PurchaseRow {
  id: string;
  referenceNumber: string;
  status: 'ordered' | 'received' | 'cancelled';
  totalAmount: string;
  currency: string;
  warehouseId: string;
  supplier: { name: string };
  orderedAt: string;
}

function newClientReferenceId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const STATUS_LABELS: Record<PurchaseRow['status'], string> = {
  ordered: 'قيد الطلب',
  received: 'مُستلَم',
  cancelled: 'ملغى',
};

/**
 * Purchases screen (docs/PURCHASING.md). Order -> Receive is two explicit
 * steps matching the real workflow: goods are ordered, then arrive and are
 * received later - receiving is what increases stock and posts the
 * Accounts Payable journal entry.
 */
export function PurchasesPage() {
  const { hasPermission } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [data, setData] = useState<PurchaseRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState<PurchaseItemRow[]>([]);
  const [pickProductId, setPickProductId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async (page = meta.page) => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await api.get('/purchases', { page, pageSize: meta.pageSize });
      setData(res.data);
      setMeta(res.meta);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'تعذّر تحميل أوامر الشراء');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    api.get('/tenancy/warehouses').then((wh) => {
      setWarehouses(wh);
      setWarehouseId(wh[0]?.id ?? '');
    }).catch(() => undefined);
    api.get('/suppliers', { pageSize: 100 }).then((r) => setSuppliers(r.data)).catch(() => undefined);
    api.get('/products', { pageSize: 100 }).then((r) => setProducts(r.data)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? '—';

  const openModal = () => {
    setSupplierId('');
    setItems([]);
    setPickProductId('');
    setFormError(null);
    setModalOpen(true);
  };

  const addItem = () => {
    const product = products.find((p) => p.id === pickProductId);
    if (!product) return;
    if (items.some((i) => i.productId === product.id)) return;
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: `${product.name} (${product.sku})`,
        quantity: '1',
        unitCost: product.costPrice,
      },
    ]);
    setPickProductId('');
  };

  const updateItem = (productId: string, patch: Partial<PurchaseItemRow>) => {
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, ...patch } : i)));
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (items.length === 0) {
      setFormError('أضف منتجًا واحدًا على الأقل');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/purchases', {
        warehouseId,
        supplierId,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitCost: Number(i.unitCost),
        })),
        clientReferenceId: newClientReferenceId(),
      });
      setModalOpen(false);
      await load(1);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذّر إنشاء أمر الشراء');
    } finally {
      setSubmitting(false);
    }
  };

  const receive = async (id: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api.post(`/purchases/${id}/receive`);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذّر استلام أمر الشراء');
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (id: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api.post(`/purchases/${id}/cancel`);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذّر إلغاء أمر الشراء');
    } finally {
      setBusyId(null);
    }
  };

  if (!hasPermission('purchases.read')) {
    return <ErrorBanner message="لا تملك صلاحية عرض المشتريات" />;
  }

  return (
    <div>
      <PageHeader
        title="المشتريات"
        action={hasPermission('purchases.create') && <Button onClick={openModal}>+ أمر شراء جديد</Button>}
      />

      <ErrorBanner message={actionError} />
      <ErrorBanner message={listError} />
      {listLoading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
      {!listLoading && (
      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2">الرقم المرجعي</th>
              <th className="py-2">المورد</th>
              <th className="py-2">المستودع</th>
              <th className="py-2">الإجمالي</th>
              <th className="py-2">الحالة</th>
              <th className="py-2">التاريخ</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-2 font-mono text-xs">{p.referenceNumber}</td>
                <td className="py-2">{p.supplier.name}</td>
                <td className="py-2 text-slate-500">{warehouseName(p.warehouseId)}</td>
                <td className="py-2 font-medium">
                  {p.totalAmount} {p.currency}
                </td>
                <td className="py-2">
                  <span
                    className={
                      p.status === 'received'
                        ? 'text-emerald-600'
                        : p.status === 'cancelled'
                          ? 'text-red-500'
                          : 'text-amber-600'
                    }
                  >
                    {STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="py-2 text-slate-500">{new Date(p.orderedAt).toLocaleString('ar-SA')}</td>
                <td className="py-2">
                  {p.status === 'ordered' && (
                    <div className="flex gap-2">
                      {hasPermission('purchases.create') && (
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => receive(p.id)}
                          className="text-xs text-brand-600 hover:underline disabled:opacity-50"
                        >
                          استلام
                        </button>
                      )}
                      {hasPermission('purchases.cancel') && (
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => cancel(p.id)}
                          className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        >
                          إلغاء
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  لا توجد أوامر شراء بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onChange={load} />
      </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="أمر شراء جديد">
        <form onSubmit={onSubmit} className="space-y-3">
          <ErrorBanner message={formError} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="المورد">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                <option value="">اختر موردًا</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="المستودع">
              <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <div className="mb-2 text-sm font-medium text-slate-700">الأصناف</div>
            <div className="flex gap-2">
              <Select value={pickProductId} onChange={(e) => setPickProductId(e.target.value)}>
                <option value="">اختر منتجًا لإضافته</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </Select>
              <Button type="button" variant="secondary" onClick={addItem} disabled={!pickProductId}>
                + إضافة
              </Button>
            </div>

            {items.length > 0 && (
              <div className="overflow-x-auto">
              <table className="mt-3 w-full text-right text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2">المنتج</th>
                    <th className="py-2">الكمية</th>
                    <th className="py-2">تكلفة الوحدة</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.productId} className="border-b last:border-0">
                      <td className="py-2">{i.productName}</td>
                      <td className="py-2">
                        <input
                          type="number"
                          min={0.001}
                          step="0.001"
                          value={i.quantity}
                          onChange={(e) => updateItem(i.productId, { quantity: e.target.value })}
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-center"
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={i.unitCost}
                          onChange={(e) => updateItem(i.productId, { unitCost: e.target.value })}
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-center"
                        />
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => removeItem(i.productId)}
                          className="text-red-500 hover:text-red-700"
                          aria-label="حذف"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={submitting || items.length === 0}>
            {submitting ? '...جارٍ الحفظ' : 'حفظ أمر الشراء'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
