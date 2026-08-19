import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatDate, formatDateTime } from '../utils/formatDate';

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

interface PurchaseItemDetail {
  id: string;
  productId: string;
  productName: string;
  quantity: string;
  unitCost: string;
}

interface SupplierPaymentRow {
  id: string;
  amount: string;
  method: string;
  reference: string | null;
  createdAt: string;
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
  items: PurchaseItemDetail[];
  supplierPayments: SupplierPaymentRow[];
}

interface PurchaseReturnRow {
  id: string;
  totalAmount: string;
  reason: string | null;
  createdAt: string;
  items: { purchaseItemId: string; quantity: string }[];
}

function newClientReferenceId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Purchases screen (docs/PURCHASING.md). Order -> Receive is two explicit
 * steps matching the real workflow: goods are ordered, then arrive and are
 * received later - receiving is what increases stock and posts the
 * Accounts Payable journal entry.
 */
export function PurchasesPage() {
  const { t } = useTranslation('purchases');
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

  const [detail, setDetail] = useState<PurchaseRow | null>(null);
  const [detailReturns, setDetailReturns] = useState<PurchaseReturnRow[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnBusy, setReturnBusy] = useState(false);

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
      setListError(err instanceof ApiError ? err.message : t('errors.loadFailed'));
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
      setFormError(t('errors.itemRequired'));
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
      setFormError(err instanceof ApiError ? err.message : t('errors.createFailed'));
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
      setActionError(err instanceof ApiError ? err.message : t('errors.receiveFailed'));
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
      setActionError(err instanceof ApiError ? err.message : t('errors.cancelFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const openDetail = async (id: string) => {
    setDetailError(null);
    setPaymentAmount('');
    setPaymentReference('');
    setReturnQuantities({});
    setReturnReason('');
    try {
      const [purchase, returns] = await Promise.all([
        api.get(`/purchases/${id}`),
        api.get(`/purchases/${id}/returns`),
      ]);
      setDetail(purchase);
      setDetailReturns(returns);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('errors.detailLoadFailed'));
    }
  };

  const outstandingBalance = (p: PurchaseRow) =>
    Math.max(
      0,
      Number(p.totalAmount) - p.supplierPayments.reduce((s, pay) => s + Number(pay.amount), 0),
    );

  const alreadyReturned = (purchaseItemId: string) =>
    detailReturns
      .flatMap((r) => r.items)
      .filter((i) => i.purchaseItemId === purchaseItemId)
      .reduce((s, i) => s + Number(i.quantity), 0);

  const submitPayment = async () => {
    if (!detail || !paymentAmount) return;
    setDetailError(null);
    setPaymentBusy(true);
    try {
      await api.post(`/purchases/${detail.id}/payments`, {
        method: paymentMethod,
        amount: Number(paymentAmount),
        reference: paymentReference || undefined,
        clientReferenceId: newClientReferenceId(),
      });
      await openDetail(detail.id);
      setPaymentAmount('');
      setPaymentReference('');
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : t('errors.paymentFailed'));
    } finally {
      setPaymentBusy(false);
    }
  };

  const submitReturn = async () => {
    if (!detail) return;
    const items = Object.entries(returnQuantities)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([purchaseItemId, qty]) => ({ purchaseItemId, quantity: Number(qty) }));
    if (items.length === 0) {
      setDetailError(t('errors.returnQuantityRequired'));
      return;
    }
    setDetailError(null);
    setReturnBusy(true);
    try {
      await api.post(`/purchases/${detail.id}/returns`, {
        items,
        reason: returnReason || undefined,
        clientReferenceId: newClientReferenceId(),
      });
      await openDetail(detail.id);
      setReturnQuantities({});
      setReturnReason('');
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : t('errors.returnFailed'));
    } finally {
      setReturnBusy(false);
    }
  };

  if (!hasPermission('purchases.read')) {
    return <ErrorBanner message={t('noPermission')} />;
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        action={hasPermission('purchases.create') && <Button onClick={openModal}>{t('newPurchaseButton')}</Button>}
      />

      <ErrorBanner message={actionError} />
      <ErrorBanner message={listError} />
      {listLoading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
      {!listLoading && (
      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2">{t('table.referenceNumber')}</th>
              <th className="py-2">{t('table.supplier')}</th>
              <th className="py-2">{t('table.warehouse')}</th>
              <th className="py-2">{t('table.total')}</th>
              <th className="py-2">{t('table.status')}</th>
              <th className="py-2">{t('table.date')}</th>
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
                    {t(`status.${p.status}`)}
                  </span>
                </td>
                <td className="py-2 text-slate-500">{formatDateTime(new Date(p.orderedAt))}</td>
                <td className="py-2">
                  <div className="flex gap-2">
                    {p.status === 'ordered' && hasPermission('purchases.create') && (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => receive(p.id)}
                        className="text-xs text-brand-600 hover:underline disabled:opacity-50"
                      >
                        {t('actions.receive')}
                      </button>
                    )}
                    {p.status === 'ordered' && hasPermission('purchases.cancel') && (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => cancel(p.id)}
                        className="text-xs text-red-500 hover:underline disabled:opacity-50"
                      >
                        {t('actions.cancel')}
                      </button>
                    )}
                    {p.status === 'received' && (
                      <button
                        type="button"
                        onClick={() => openDetail(p.id)}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        {t('actions.detailsPaymentReturn')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  {t('table.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onChange={load} />
      </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('modal.newPurchaseTitle')}>
        <form onSubmit={onSubmit} className="space-y-3">
          <ErrorBanner message={formError} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.supplier')}>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                <option value="">{t('fields.selectSupplier')}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('fields.warehouse')}>
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
            <div className="mb-2 text-sm font-medium text-slate-700">{t('fields.items')}</div>
            <div className="flex gap-2">
              <Select value={pickProductId} onChange={(e) => setPickProductId(e.target.value)}>
                <option value="">{t('fields.selectProduct')}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </Select>
              <Button type="button" variant="secondary" onClick={addItem} disabled={!pickProductId}>
                {t('actions.addItem')}
              </Button>
            </div>

            {items.length > 0 && (
              <div className="overflow-x-auto">
              <table className="mt-3 w-full text-start text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2">{t('fields.product')}</th>
                    <th className="py-2">{t('fields.quantity')}</th>
                    <th className="py-2">{t('fields.unitCost')}</th>
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
                          aria-label={t('actions.remove')}
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
            {submitting ? t('actions.saving') : t('actions.save')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={t('modal.detailTitle', { reference: detail?.referenceNumber ?? '' })}
      >
        {detail && (
          <div className="space-y-4">
            <ErrorBanner message={detailError} />

            <div>
              <div className="mb-1 text-sm font-medium text-slate-700">{t('fields.items')}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-1">{t('fields.product')}</th>
                      <th className="py-1">{t('fields.receivedQuantity')}</th>
                      <th className="py-1">{t('fields.previouslyReturned')}</th>
                      {hasPermission('purchases.return') && <th className="py-1">{t('fields.returnQuantity')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => {
                      const returned = alreadyReturned(item.id);
                      const remaining = Number(item.quantity) - returned;
                      return (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-1">{item.productName}</td>
                          <td className="py-1">{item.quantity}</td>
                          <td className="py-1 text-slate-500">{returned || '—'}</td>
                          {hasPermission('purchases.return') && (
                            <td className="py-1">
                              <input
                                type="number"
                                min={0}
                                max={remaining}
                                step="0.001"
                                disabled={remaining <= 0}
                                value={returnQuantities[item.id] ?? ''}
                                onChange={(e) =>
                                  setReturnQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-center disabled:bg-slate-100"
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {hasPermission('purchases.return') && (
              <div className="border-t border-slate-200 pt-3">
                <Field label={t('fields.returnReasonOptional')}>
                  <input
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 w-full"
                  disabled={returnBusy}
                  onClick={submitReturn}
                >
                  {returnBusy ? t('actions.recording') : t('actions.recordReturn')}
                </Button>
              </div>
            )}

            <div className="border-t border-slate-200 pt-3">
              <div className="mb-1 text-sm font-medium text-slate-700">{t('fields.supplierPayments')}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <tbody>
                    {detail.supplierPayments.map((pay) => (
                      <tr key={pay.id} className="border-b last:border-0">
                        <td className="py-1">{t(`paymentMethods.${pay.method}`, { defaultValue: pay.method })}</td>
                        <td className="py-1 font-medium">{Number(pay.amount).toFixed(2)}</td>
                        <td className="py-1 text-slate-500">{pay.reference ?? '—'}</td>
                        <td className="py-1 text-slate-500">
                          {formatDate(new Date(pay.createdAt))}
                        </td>
                      </tr>
                    ))}
                    {detail.supplierPayments.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-2 text-center text-slate-400">
                          {t('fields.noPaymentsYet')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-end font-bold">
                {t('fields.outstandingBalance', {
                  amount: outstandingBalance(detail).toFixed(2),
                  currency: detail.currency,
                })}
              </div>
            </div>

            {hasPermission('purchases.payment.record') && outstandingBalance(detail) > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <div className="mb-2 text-sm font-medium text-slate-700">{t('fields.recordNewPayment')}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('fields.method')}>
                    <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                      <option value="cash">{t('paymentMethods.cash')}</option>
                      <option value="card">{t('paymentMethods.card')}</option>
                      <option value="transfer">{t('paymentMethods.transfer')}</option>
                      <option value="other">{t('paymentMethods.other')}</option>
                    </Select>
                  </Field>
                  <Field label={t('fields.amount')}>
                    <input
                      type="number"
                      min={0}
                      max={outstandingBalance(detail)}
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                </div>
                <Field label={t('fields.paymentReferenceOptional')}>
                  <input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </Field>
                <Button
                  type="button"
                  className="mt-2 w-full"
                  disabled={paymentBusy || !paymentAmount}
                  onClick={submitPayment}
                >
                  {paymentBusy ? t('actions.recording') : t('actions.recordPayment')}
                </Button>
              </div>
            )}

            {detailReturns.length > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <div className="mb-1 text-sm font-medium text-slate-700">{t('fields.previousReturns')}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-sm">
                    <tbody>
                      {detailReturns.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-1 font-medium">{Number(r.totalAmount).toFixed(2)}</td>
                          <td className="py-1 text-slate-500">{r.reason ?? '—'}</td>
                          <td className="py-1 text-slate-500">
                            {formatDate(new Date(r.createdAt))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
