import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Card, ErrorBanner, Modal, PageHeader } from '../components/ui';
import { useAuth } from '../state/auth';

// Western digits, matching every other page's money display - see ReportsPage.tsx for rationale.
const money = (n: number) => Number(n).toFixed(2);

interface BalanceRow {
  balance: number;
  [key: string]: unknown;
}

function BalanceList({
  title,
  emptyHint,
  listPath,
  statementPath,
  idKey,
  nameKey,
}: {
  title: string;
  emptyHint: string;
  listPath: string;
  statementPath: (id: string) => string;
  idKey: string;
  nameKey: string;
}) {
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statement, setStatement] = useState<any | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get(listPath)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : `تعذّر تحميل ${title}`))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openStatement = async (id: string) => {
    setStatementLoading(true);
    try {
      const res = await api.get(statementPath(id));
      setStatement(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل كشف الحساب');
    } finally {
      setStatementLoading(false);
    }
  };

  return (
    <div>
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
      {!loading && (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">الاسم</th>
                <th className="py-2">الرصيد</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[idKey] as string} className="border-b last:border-0">
                  <td className="py-2">{r[nameKey] as string}</td>
                  <td className="py-2">{money(r.balance)}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => openStatement(r[idKey] as string)}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      كشف الحساب
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-400">
                    {emptyHint}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      <Modal open={statement !== null} onClose={() => setStatement(null)} title="كشف الحساب">
        {statementLoading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
        {statement && !statementLoading && (
          <div className="space-y-3">
            <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">التاريخ</th>
                  <th className="py-2">الوصف</th>
                  <th className="py-2">مدين</th>
                  <th className="py-2">دائن</th>
                  <th className="py-2">الرصيد الجاري</th>
                </tr>
              </thead>
              <tbody>
                {statement.transactions.map((t: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 text-slate-500">{new Date(t.date).toLocaleDateString('ar-SA')}</td>
                    <td className="py-2">{t.description ?? '—'}</td>
                    <td className="py-2">{Number(t.debit) > 0 ? money(t.debit) : '—'}</td>
                    <td className="py-2">{Number(t.credit) > 0 ? money(t.credit) : '—'}</td>
                    <td className="py-2 font-medium">{money(t.runningBalance)}</td>
                  </tr>
                ))}
                {statement.transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">لا توجد حركات</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            <div className="text-left font-bold">الرصيد: {money(statement.balance)}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * AR/AP subledgers (docs/ACCOUNTING.md "AR/AP subledger"). AR reads live off
 * the ledger like everything else - it will legitimately show no customers
 * today because Sales require full payment at completion (no credit-sale
 * flow exists yet), not because this page is broken. AP is real and populated
 * from every received Purchase.
 */
export function ReceivablesPayablesPage() {
  const { hasPermission } = useAuth();
  const canViewAr = hasPermission('accounting.ar.view');
  const canViewAp = hasPermission('accounting.ap.view');
  const [tab, setTab] = useState<'ar' | 'ap'>(canViewAr ? 'ar' : 'ap');

  if (!canViewAr && !canViewAp) {
    return <ErrorBanner message="لا تملك صلاحية عرض ذمم العملاء أو الموردين" />;
  }

  return (
    <div>
      <PageHeader title="الذمم (العملاء والموردون)" />
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {canViewAr && (
          <button
            type="button"
            onClick={() => setTab('ar')}
            className={`px-3 py-2 text-sm font-medium ${tab === 'ar' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'}`}
          >
            ذمم العملاء (AR)
          </button>
        )}
        {canViewAp && (
          <button
            type="button"
            onClick={() => setTab('ap')}
            className={`px-3 py-2 text-sm font-medium ${tab === 'ap' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'}`}
          >
            ذمم الموردين (AP)
          </button>
        )}
      </div>

      {tab === 'ar' && canViewAr && (
        <BalanceList
          title="ذمم العملاء"
          emptyHint="لا توجد أرصدة عملاء - النظام حاليًا لا يدعم البيع الآجل (كل عملية بيع تُدفع بالكامل عند إتمامها)"
          listPath="/accounting/ar/customers"
          statementPath={(id) => `/accounting/ar/customers/${id}`}
          idKey="customerId"
          nameKey="customerName"
        />
      )}
      {tab === 'ap' && canViewAp && (
        <BalanceList
          title="ذمم الموردين"
          emptyHint="لا توجد أرصدة موردين بعد"
          listPath="/accounting/ap/suppliers"
          statementPath={(id) => `/accounting/ap/suppliers/${id}`}
          idKey="supplierId"
          nameKey="supplierName"
        />
      )}
    </div>
  );
}
