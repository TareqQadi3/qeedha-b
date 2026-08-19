import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Card, ErrorBanner, Modal, PageHeader } from '../components/ui';
import { useAuth } from '../state/auth';
import { formatDate } from '../utils/formatDate';

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
  const { t } = useTranslation('receivablesPayables');
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
      .catch((err) => setError(err instanceof ApiError ? err.message : t('errors.loadFailed', { title })))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openStatement = async (id: string) => {
    setStatementLoading(true);
    try {
      const res = await api.get(statementPath(id));
      setStatement(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.statementLoadFailed'));
    } finally {
      setStatementLoading(false);
    }
  };

  return (
    <div>
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
      {!loading && (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">{t('table.name')}</th>
                <th className="py-2">{t('table.balance')}</th>
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
                      {t('actions.statement')}
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

      <Modal open={statement !== null} onClose={() => setStatement(null)} title={t('modal.statementTitle')}>
        {statementLoading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
        {statement && !statementLoading && (
          <div className="space-y-3">
            <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('table.date')}</th>
                  <th className="py-2">{t('table.description')}</th>
                  <th className="py-2">{t('table.debit')}</th>
                  <th className="py-2">{t('table.credit')}</th>
                  <th className="py-2">{t('table.runningBalance')}</th>
                </tr>
              </thead>
              <tbody>
                {statement.transactions.map((tx: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 text-slate-500">{formatDate(new Date(tx.date))}</td>
                    <td className="py-2">{tx.description ?? '—'}</td>
                    <td className="py-2">{Number(tx.debit) > 0 ? money(tx.debit) : '—'}</td>
                    <td className="py-2">{Number(tx.credit) > 0 ? money(tx.credit) : '—'}</td>
                    <td className="py-2 font-medium">{money(tx.runningBalance)}</td>
                  </tr>
                ))}
                {statement.transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">{t('table.noTransactions')}</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            <div className="text-end font-bold">{t('labels.balance')} {money(statement.balance)}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * AR/AP subledgers (docs/ACCOUNTING.md "AR/AP subledger"). Both read live off
 * the ledger like everything else - AR is populated from any sale left
 * partially/fully unpaid (docs/ACCOUNTING.md "Customer Credit Sales / AR")
 * and AP from every received Purchase. Recording a payment against a
 * specific sale/purchase happens from that sale's/purchase's own detail view
 * (InvoicesPage / PurchasesPage), not from this aggregate balance list.
 */
export function ReceivablesPayablesPage() {
  const { t } = useTranslation('receivablesPayables');
  const { hasPermission } = useAuth();
  const canViewAr = hasPermission('accounting.ar.view');
  const canViewAp = hasPermission('accounting.ap.view');
  const [tab, setTab] = useState<'ar' | 'ap'>(canViewAr ? 'ar' : 'ap');

  if (!canViewAr && !canViewAp) {
    return <ErrorBanner message={t('errors.noViewPermission')} />;
  }

  return (
    <div>
      <PageHeader title={t('title')} />
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {canViewAr && (
          <button
            type="button"
            onClick={() => setTab('ar')}
            className={`px-3 py-2 text-sm font-medium ${tab === 'ar' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'}`}
          >
            {t('tabs.ar')}
          </button>
        )}
        {canViewAp && (
          <button
            type="button"
            onClick={() => setTab('ap')}
            className={`px-3 py-2 text-sm font-medium ${tab === 'ap' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'}`}
          >
            {t('tabs.ap')}
          </button>
        )}
      </div>

      {tab === 'ar' && canViewAr && (
        <BalanceList
          title={t('sections.arTitle')}
          emptyHint={t('sections.arEmpty')}
          listPath="/accounting/ar/customers"
          statementPath={(id) => `/accounting/ar/customers/${id}`}
          idKey="customerId"
          nameKey="customerName"
        />
      )}
      {tab === 'ap' && canViewAp && (
        <BalanceList
          title={t('sections.apTitle')}
          emptyHint={t('sections.apEmpty')}
          listPath="/accounting/ap/suppliers"
          statementPath={(id) => `/accounting/ap/suppliers/${id}`}
          idKey="supplierId"
          nameKey="supplierName"
        />
      )}
    </div>
  );
}
