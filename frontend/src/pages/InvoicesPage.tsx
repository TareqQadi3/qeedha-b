import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Modal, PageHeader, Pagination, Select } from '../components/ui';
import { useAuth } from '../state/auth';
import { formatDate, formatDateTime } from '../utils/formatDate';

interface InvoiceCompliance {
  status: 'not_submitted' | 'pending' | 'reported' | 'cleared' | 'rejected';
  qrCode: string | null;
}

interface SaleItemDetail {
  id: string;
  productName: string;
  quantity: string;
}

interface SalePaymentRow {
  id: string;
  amount: string;
  method: string;
  createdAt: string;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: 'issued' | 'cancelled';
  totalAmount: string;
  currency: string;
  issuedAt: string;
  customer: { name: string } | null;
  sale: {
    id: string;
    status: 'completed' | 'cancelled';
    totalAmount: string;
    items: SaleItemDetail[];
    payments: SalePaymentRow[];
  };
  compliance: InvoiceCompliance | null;
}

interface SaleReturnRow {
  id: string;
  totalAmount: string;
  reason: string | null;
  createdAt: string;
  items: { saleItemId: string; quantity: string }[];
}

const PAYMENT_METHOD_KEYS: Record<string, string> = {
  cash: 'paymentMethods.cash',
  card: 'paymentMethods.card',
  transfer: 'paymentMethods.transfer',
  other: 'paymentMethods.other',
};

function newClientReferenceId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Sales/invoice history (docs/POS.md) - creating a sale still only happens on
 * the POS screen. Milestone 7 adds AR settlement (recordPayment) and genuine
 * sales returns directly from a row's detail view - see docs/ACCOUNTING.md
 * "Customer Credit Sales / AR" / "Sales Returns".
 */
export function InvoicesPage() {
  const { t } = useTranslation('sales');
  const { hasPermission } = useAuth();
  const [data, setData] = useState<InvoiceRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrInvoice, setQrInvoice] = useState<InvoiceRow | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const [detail, setDetail] = useState<InvoiceRow | null>(null);
  const [detailReturns, setDetailReturns] = useState<SaleReturnRow[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnBusy, setReturnBusy] = useState(false);

  const load = async (page = meta.page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/invoices', { page, pageSize: meta.pageSize });
      setData(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasPermission('invoices.read')) load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (invoice: InvoiceRow) => {
    setDetailError(null);
    setPaymentAmount('');
    setReturnQuantities({});
    setReturnReason('');
    try {
      const returns = await api.get(`/sales/${invoice.sale.id}/returns`);
      setDetailReturns(returns);
      setDetail(invoice);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.loadDetailFailed'));
    }
  };

  const outstandingBalance = (inv: InvoiceRow) =>
    Math.max(
      0,
      Number(inv.sale.totalAmount) -
        inv.sale.payments.reduce((s, p) => s + Number(p.amount), 0),
    );

  const alreadyReturned = (saleItemId: string) =>
    detailReturns
      .flatMap((r) => r.items)
      .filter((i) => i.saleItemId === saleItemId)
      .reduce((s, i) => s + Number(i.quantity), 0);

  const refreshDetail = async () => {
    if (!detail) return;
    const [invoices, returns] = await Promise.all([
      api.get('/invoices', { page: meta.page, pageSize: meta.pageSize }),
      api.get(`/sales/${detail.sale.id}/returns`),
    ]);
    setData(invoices.data);
    setDetailReturns(returns);
    const refreshed = invoices.data.find((i: InvoiceRow) => i.id === detail.id);
    if (refreshed) setDetail(refreshed);
  };

  const submitPayment = async () => {
    if (!detail || !paymentAmount) return;
    setDetailError(null);
    setPaymentBusy(true);
    try {
      await api.post(`/sales/${detail.sale.id}/payments`, {
        method: paymentMethod,
        amount: Number(paymentAmount),
        clientReferenceId: newClientReferenceId(),
      });
      await refreshDetail();
      setPaymentAmount('');
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : t('errors.recordPaymentFailed'));
    } finally {
      setPaymentBusy(false);
    }
  };

  const submitReturn = async () => {
    if (!detail) return;
    const items = Object.entries(returnQuantities)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([saleItemId, qty]) => ({ saleItemId, quantity: Number(qty) }));
    if (items.length === 0) {
      setDetailError(t('errors.selectReturnQuantity'));
      return;
    }
    setDetailError(null);
    setReturnBusy(true);
    try {
      await api.post(`/sales/${detail.sale.id}/returns`, {
        items,
        reason: returnReason || undefined,
        clientReferenceId: newClientReferenceId(),
      });
      await refreshDetail();
      setReturnQuantities({});
      setReturnReason('');
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : t('errors.recordReturnFailed'));
    } finally {
      setReturnBusy(false);
    }
  };

  const openQr = async (invoice: InvoiceRow) => {
    setQrInvoice(invoice);
    setQrImage(null);
    setQrError(null);
    if (!invoice.compliance?.qrCode) return;
    try {
      const dataUrl = await QRCode.toDataURL(invoice.compliance.qrCode);
      setQrImage(dataUrl);
    } catch {
      setQrError(t('errors.qrRenderFailed'));
    }
  };

  if (!hasPermission('invoices.read')) {
    return <ErrorBanner message={t('errors.noPermission')} />;
  }

  return (
    <div>
      <PageHeader title={t('title')} />
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">{t('common:loading')}</div>}
      {!loading && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('table.invoiceNumber')}</th>
                  <th className="py-2">{t('table.date')}</th>
                  <th className="py-2">{t('table.customer')}</th>
                  <th className="py-2">{t('table.paymentMethod')}</th>
                  <th className="py-2">{t('table.total')}</th>
                  <th className="py-2">{t('table.status')}</th>
                  <th className="py-2">{t('table.qr')}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="py-2 text-slate-500">
                      {formatDateTime(new Date(inv.issuedAt))}
                    </td>
                    <td className="py-2">{inv.customer?.name ?? t('cashCustomer')}</td>
                    <td className="py-2 text-slate-500">
                      {inv.sale.payments.map((p) => p.method).join(t('listSeparator')) || t('fullyDeferred')}
                    </td>
                    <td className="py-2 font-medium">
                      {inv.totalAmount} {inv.currency}
                    </td>
                    <td className="py-2">
                      <span className={inv.status === 'issued' ? 'text-emerald-600' : 'text-red-500'}>
                        {inv.status === 'issued' ? t('status.issued') : t('status.cancelled')}
                      </span>
                    </td>
                    <td className="py-2">
                      {inv.compliance?.qrCode ? (
                        <button
                          type="button"
                          onClick={() => openQr(inv)}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          {t('actions.viewQr')}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      {inv.sale.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => openDetail(inv)}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          {t('actions.detailsPaymentReturn')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400">
                      {t('emptyState.noSales')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onChange={load} />
        </Card>
      )}

      <Modal
        open={!!qrInvoice}
        onClose={() => setQrInvoice(null)}
        title={t('qrModal.title', { invoiceNumber: qrInvoice?.invoiceNumber ?? '' })}
      >
        <ErrorBanner message={qrError} />
        {qrImage && (
          <div className="flex flex-col items-center gap-3">
            <img src={qrImage} alt={t('qrModal.imageAlt')} className="h-48 w-48" />
            <p className="text-center text-xs text-slate-500">{t('qrModal.disclaimer')}</p>
          </div>
        )}
        {!qrImage && !qrError && (
          <div className="py-6 text-center text-slate-400">{t('qrModal.preparing')}</div>
        )}
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={t('detailModal.title', { invoiceNumber: detail?.invoiceNumber ?? '' })}
      >
        {detail && (
          <div className="space-y-4">
            <ErrorBanner message={detailError} />

            <div>
              <div className="mb-1 text-sm font-medium text-slate-700">{t('detailModal.itemsHeading')}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-1">{t('table.product')}</th>
                      <th className="py-1">{t('table.quantitySold')}</th>
                      <th className="py-1">{t('table.previouslyReturned')}</th>
                      {hasPermission('sales.return') && <th className="py-1">{t('table.returnQuantity')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.sale.items.map((item) => {
                      const returned = alreadyReturned(item.id);
                      const remaining = Number(item.quantity) - returned;
                      return (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-1">{item.productName}</td>
                          <td className="py-1">{item.quantity}</td>
                          <td className="py-1 text-slate-500">{returned || '—'}</td>
                          {hasPermission('sales.return') && (
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

            {hasPermission('sales.return') && (
              <div className="border-t border-slate-200 pt-3">
                <Field label={t('fields.returnReason')}>
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
                  {returnBusy ? t('actions.recordingReturn') : t('actions.recordSalesReturn')}
                </Button>
              </div>
            )}

            <div className="border-t border-slate-200 pt-3">
              <div className="mb-1 text-sm font-medium text-slate-700">{t('detailModal.paymentsHeading')}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <tbody>
                    {detail.sale.payments.map((pay) => (
                      <tr key={pay.id} className="border-b last:border-0">
                        <td className="py-1">
                          {PAYMENT_METHOD_KEYS[pay.method] ? t(PAYMENT_METHOD_KEYS[pay.method]) : pay.method}
                        </td>
                        <td className="py-1 font-medium">{Number(pay.amount).toFixed(2)}</td>
                        <td className="py-1 text-slate-500">
                          {formatDate(new Date(pay.createdAt))}
                        </td>
                      </tr>
                    ))}
                    {detail.sale.payments.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-2 text-center text-slate-400">
                          {t('emptyState.noPayments')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-end font-bold">
                {t('detailModal.outstandingBalance', {
                  balance: outstandingBalance(detail).toFixed(2),
                  currency: detail.currency,
                })}
              </div>
            </div>

            {hasPermission('sales.payment.record') && outstandingBalance(detail) > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <div className="mb-2 text-sm font-medium text-slate-700">{t('detailModal.newPaymentHeading')}</div>
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
                <Button
                  type="button"
                  className="mt-2 w-full"
                  disabled={paymentBusy || !paymentAmount}
                  onClick={submitPayment}
                >
                  {paymentBusy ? t('actions.recordingPayment') : t('actions.recordPayment')}
                </Button>
              </div>
            )}

            {detailReturns.length > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <div className="mb-1 text-sm font-medium text-slate-700">{t('detailModal.previousReturnsHeading')}</div>
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
