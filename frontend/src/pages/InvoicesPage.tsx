import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Card, ErrorBanner, PageHeader, Pagination } from '../components/ui';
import { useAuth } from '../state/auth';

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: 'issued' | 'cancelled';
  totalAmount: string;
  currency: string;
  issuedAt: string;
  customer: { name: string } | null;
  sale: { payments: { method: string }[] };
}

/** Read-only sales/invoice history - see docs/POS.md. Creating a sale happens only on the POS screen; this page is for verification/lookup. */
export function InvoicesPage() {
  const { hasPermission } = useAuth();
  const [data, setData] = useState<InvoiceRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (page = meta.page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/invoices', { page, pageSize: meta.pageSize });
      setData(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل الفواتير');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasPermission('invoices.read')) load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasPermission('invoices.read')) {
    return <ErrorBanner message="لا تملك صلاحية عرض المبيعات والفواتير" />;
  }

  return (
    <div>
      <PageHeader title="المبيعات والفواتير" />
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
      {!loading && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">رقم الفاتورة</th>
                  <th className="py-2">التاريخ</th>
                  <th className="py-2">العميل</th>
                  <th className="py-2">طريقة الدفع</th>
                  <th className="py-2">الإجمالي</th>
                  <th className="py-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="py-2 text-slate-500">
                      {new Date(inv.issuedAt).toLocaleString('ar-SA')}
                    </td>
                    <td className="py-2">{inv.customer?.name ?? 'عميل نقدي'}</td>
                    <td className="py-2 text-slate-500">
                      {inv.sale.payments.map((p) => p.method).join('، ')}
                    </td>
                    <td className="py-2 font-medium">
                      {inv.totalAmount} {inv.currency}
                    </td>
                    <td className="py-2">
                      <span className={inv.status === 'issued' ? 'text-emerald-600' : 'text-red-500'}>
                        {inv.status === 'issued' ? 'سارية' : 'ملغاة'}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      لا توجد مبيعات بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onChange={load} />
        </Card>
      )}
    </div>
  );
}
