import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Select } from '../components/ui';
import { useAuth } from '../state/auth';
import { formatDate } from '../utils/formatDate';

type Tab = 'trial-balance' | 'general-ledger' | 'pl' | 'balance-sheet';

const TABS: { key: Tab; labelKey: string }[] = [
  { key: 'trial-balance', labelKey: 'tabs.trialBalance' },
  { key: 'general-ledger', labelKey: 'tabs.generalLedger' },
  { key: 'pl', labelKey: 'tabs.pl' },
  { key: 'balance-sheet', labelKey: 'tabs.balanceSheet' },
];

// Western digits, matching every other page's money display (raw decimal strings from the API) - ar-SA locale formatting would render Eastern Arabic-Indic numerals, inconsistent with the rest of the app.
const money = (n: number) => n.toFixed(2);

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

function DateRangeFields({
  dateFrom,
  dateTo,
  onChange,
  onApply,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (dateFrom: string, dateTo: string) => void;
  onApply: () => void;
}) {
  const { t } = useTranslation('reports');
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Field label={t('fields.dateFrom')}>
        <Input type="date" value={dateFrom} onChange={(e) => onChange(e.target.value, dateTo)} />
      </Field>
      <Field label={t('fields.dateTo')}>
        <Input type="date" value={dateTo} onChange={(e) => onChange(dateFrom, e.target.value)} />
      </Field>
      <Button variant="secondary" onClick={onApply}>
        {t('actions.apply')}
      </Button>
    </div>
  );
}

function TrialBalanceTab() {
  const { t } = useTranslation('reports');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/accounting/reports/trial-balance', {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('trialBalance.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <DateRangeFields dateFrom={dateFrom} dateTo={dateTo} onChange={(f, to) => { setDateFrom(f); setDateTo(to); }} onApply={load} />
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
      {!loading && data && (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">{t('table.code')}</th>
                <th className="py-2">{t('table.account')}</th>
                <th className="py-2">{t('table.debit')}</th>
                <th className="py-2">{t('table.credit')}</th>
                <th className="py-2">{t('table.netBalance')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.accountId} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{r.accountCode}</td>
                  <td className="py-2">{r.accountName}</td>
                  <td className="py-2">{money(r.totalDebit)}</td>
                  <td className="py-2">{money(r.totalCredit)}</td>
                  <td className="py-2">{money(r.netBalance)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    {t('trialBalance.empty')}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium text-slate-800">
                <td colSpan={2} className="py-2">{t('table.total')}</td>
                <td className="py-2">{money(data.totals.totalDebit)}</td>
                <td className="py-2">{money(data.totals.totalCredit)}</td>
                <td className="py-2">
                  <span className={data.totals.isBalanced ? 'text-emerald-600' : 'text-red-600'}>
                    {data.totals.isBalanced ? t('trialBalance.balanced') : t('trialBalance.notBalanced')}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function GeneralLedgerTab() {
  const { t } = useTranslation('reports');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/accounting/accounts')
      .then((res) => {
        setAccounts(res);
        if (res.length > 0) setAccountId(res[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('generalLedger.accountsLoadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (id = accountId) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/accounting/reports/general-ledger', {
        accountId: id,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('generalLedger.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountId) load(accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t('fields.account')}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('fields.dateFrom')}>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label={t('fields.dateTo')}>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={() => load()}>
          {t('actions.apply')}
        </Button>
      </div>
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
      {!loading && data && (
        <Card>
          <div className="mb-3 flex justify-between text-sm text-slate-600">
            <span>{t('generalLedger.openingBalance', { value: money(data.openingBalance) })}</span>
            <span>{t('generalLedger.closingBalance', { value: money(data.closingBalance) })}</span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">{t('table.date')}</th>
                <th className="py-2">{t('table.source')}</th>
                <th className="py-2">{t('table.description')}</th>
                <th className="py-2">{t('table.debit')}</th>
                <th className="py-2">{t('table.credit')}</th>
                <th className="py-2">{t('table.runningBalance')}</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l: any, i: number) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 text-slate-500">{formatDate(new Date(l.date))}</td>
                  <td className="py-2 text-slate-500">{l.referenceType}</td>
                  <td className="py-2">{l.description ?? '—'}</td>
                  <td className="py-2">{Number(l.debit) > 0 ? money(l.debit) : '—'}</td>
                  <td className="py-2">{Number(l.credit) > 0 ? money(l.credit) : '—'}</td>
                  <td className="py-2 font-medium">{money(l.runningBalance)}</td>
                </tr>
              ))}
              {data.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    {t('generalLedger.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function ProfitAndLossTab() {
  const { t } = useTranslation('reports');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/accounting/reports/profit-and-loss', {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('pl.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <DateRangeFields dateFrom={dateFrom} dateTo={dateTo} onChange={(f, to) => { setDateFrom(f); setDateTo(to); }} onApply={load} />
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
      {!loading && data && (
        <div className="space-y-4">
          <Card>
            <h3 className="mb-2 font-bold text-slate-700">{t('pl.revenue')}</h3>
            <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <tbody>
                {data.revenue.map((r: any) => (
                  <tr key={r.accountId} className="border-b last:border-0">
                    <td className="py-2">{r.accountName}</td>
                    <td className="py-2">{money(r.amount)}</td>
                  </tr>
                ))}
                {data.revenue.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-slate-400">{t('pl.emptyRevenue')}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="py-2">{t('pl.totalRevenue')}</td>
                  <td className="py-2">{money(data.totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </Card>
          <Card>
            <h3 className="mb-2 font-bold text-slate-700">{t('pl.expenses')}</h3>
            <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <tbody>
                {data.expenses.map((r: any) => (
                  <tr key={r.accountId} className="border-b last:border-0">
                    <td className="py-2">{r.accountName}</td>
                    <td className="py-2">{money(r.amount)}</td>
                  </tr>
                ))}
                {data.expenses.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-slate-400">{t('pl.emptyExpenses')}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="py-2">{t('pl.totalExpense')}</td>
                  <td className="py-2">{money(data.totalExpense)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </Card>
          <Card>
            <div className="flex justify-between text-sm text-slate-600">
              <span>{t('pl.cogs')}</span>
              <span>{money(data.costOfGoodsSold ?? 0)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 text-sm font-medium text-slate-700">
              <span>{t('pl.grossProfit')}</span>
              <span>{money(data.grossProfit ?? data.totalRevenue)}</span>
            </div>
          </Card>
          <Card className="bg-brand-50">
            <div className="flex justify-between text-base font-bold">
              <span>{t('pl.netProfit')}</span>
              <span className={data.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}>{money(data.netProfit)}</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function BalanceSheetTab() {
  const { t } = useTranslation('reports');
  const [asOfDate, setAsOfDate] = useState('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/accounting/reports/balance-sheet', { asOfDate: asOfDate || undefined });
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('balanceSheet.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const section = (title: string, rows: any[]) => (
    <Card>
      <h3 className="mb-2 font-bold text-slate-700">{title}</h3>
      <div className="overflow-x-auto">
      <table className="w-full text-start text-sm">
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={r.accountId ?? i} className="border-b last:border-0">
              <td className="py-2">
                {r.accountName}
                {r.computed && <span className="ms-2 text-xs text-slate-400">{t('balanceSheet.computedNote')}</span>}
              </td>
              <td className="py-2">{money(r.balance)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="py-4 text-center text-slate-400">{t('balanceSheet.emptyItems')}</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </Card>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t('fields.asOfDate')}>
          <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={load}>
          {t('actions.apply')}
        </Button>
      </div>
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
      {!loading && data && (
        <div className="space-y-4">
          {section(t('balanceSheet.assets'), data.assets)}
          {section(t('balanceSheet.liabilities'), data.liabilities)}
          {section(t('balanceSheet.equity'), data.equity)}
          <Card className={data.totals.isBalanced ? 'bg-emerald-50' : 'bg-red-50'}>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>{t('balanceSheet.totalAssets')} <span className="font-bold">{money(data.totals.totalAssets)}</span></div>
              <div>{t('balanceSheet.liabilitiesPlusEquity')} <span className="font-bold">{money(data.totals.totalLiabilities + data.totals.totalEquity)}</span></div>
              <div className={data.totals.isBalanced ? 'font-bold text-emerald-700' : 'font-bold text-red-700'}>
                {data.totals.isBalanced ? t('balanceSheet.balanced') : t('balanceSheet.notBalanced')}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Trial Balance / General Ledger / P&L / Balance Sheet - all read live from the posted ledger (docs/ACCOUNTING.md "Reporting foundation"), no mock data. */
export function ReportsPage() {
  const { t } = useTranslation('reports');
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>('trial-balance');

  if (!hasPermission('accounting.reports.view')) {
    return <ErrorBanner message={t('noPermission')} />;
  }

  return (
    <div>
      <PageHeader title={t('pageTitle')} />
      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((tabDef) => (
          <button
            key={tabDef.key}
            type="button"
            onClick={() => setTab(tabDef.key)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === tabDef.key ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'
            }`}
          >
            {t(tabDef.labelKey)}
          </button>
        ))}
      </div>
      {tab === 'trial-balance' && <TrialBalanceTab />}
      {tab === 'general-ledger' && <GeneralLedgerTab />}
      {tab === 'pl' && <ProfitAndLossTab />}
      {tab === 'balance-sheet' && <BalanceSheetTab />}
    </div>
  );
}
