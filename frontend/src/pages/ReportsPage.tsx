import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Select } from '../components/ui';
import { useAuth } from '../state/auth';

type Tab = 'trial-balance' | 'general-ledger' | 'pl' | 'balance-sheet';

const TABS: { key: Tab; label: string }[] = [
  { key: 'trial-balance', label: 'ميزان المراجعة' },
  { key: 'general-ledger', label: 'دفتر الأستاذ' },
  { key: 'pl', label: 'الأرباح والخسائر' },
  { key: 'balance-sheet', label: 'الميزانية العمومية' },
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
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Field label="من تاريخ">
        <Input type="date" value={dateFrom} onChange={(e) => onChange(e.target.value, dateTo)} />
      </Field>
      <Field label="إلى تاريخ">
        <Input type="date" value={dateTo} onChange={(e) => onChange(dateFrom, e.target.value)} />
      </Field>
      <Button variant="secondary" onClick={onApply}>
        تطبيق
      </Button>
    </div>
  );
}

function TrialBalanceTab() {
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
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل ميزان المراجعة');
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
      <DateRangeFields dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} onApply={load} />
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
      {!loading && data && (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">الرمز</th>
                <th className="py-2">الحساب</th>
                <th className="py-2">مدين</th>
                <th className="py-2">دائن</th>
                <th className="py-2">الرصيد الصافي</th>
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
                    لا توجد حركات محاسبية في هذا المدى
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium text-slate-800">
                <td colSpan={2} className="py-2">الإجمالي</td>
                <td className="py-2">{money(data.totals.totalDebit)}</td>
                <td className="py-2">{money(data.totals.totalCredit)}</td>
                <td className="py-2">
                  <span className={data.totals.isBalanced ? 'text-emerald-600' : 'text-red-600'}>
                    {data.totals.isBalanced ? 'متوازن' : 'غير متوازن'}
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
      .catch((err) => setError(err instanceof ApiError ? err.message : 'تعذّر تحميل دليل الحسابات'));
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
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل دفتر الأستاذ');
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
        <Field label="الحساب">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="من تاريخ">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="إلى تاريخ">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={() => load()}>
          تطبيق
        </Button>
      </div>
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
      {!loading && data && (
        <Card>
          <div className="mb-3 flex justify-between text-sm text-slate-600">
            <span>الرصيد الافتتاحي: {money(data.openingBalance)}</span>
            <span>الرصيد الختامي: {money(data.closingBalance)}</span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">التاريخ</th>
                <th className="py-2">المصدر</th>
                <th className="py-2">الوصف</th>
                <th className="py-2">مدين</th>
                <th className="py-2">دائن</th>
                <th className="py-2">الرصيد الجاري</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l: any, i: number) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 text-slate-500">{new Date(l.date).toLocaleDateString('ar-SA')}</td>
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
                    لا توجد حركات لهذا الحساب في هذا المدى
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
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل تقرير الأرباح والخسائر');
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
      <DateRangeFields dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} onApply={load} />
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
      {!loading && data && (
        <div className="space-y-4">
          <Card>
            <h3 className="mb-2 font-bold text-slate-700">الإيرادات</h3>
            <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <tbody>
                {data.revenue.map((r: any) => (
                  <tr key={r.accountId} className="border-b last:border-0">
                    <td className="py-2">{r.accountName}</td>
                    <td className="py-2">{money(r.amount)}</td>
                  </tr>
                ))}
                {data.revenue.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-slate-400">لا توجد إيرادات في هذا المدى</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="py-2">إجمالي الإيرادات</td>
                  <td className="py-2">{money(data.totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </Card>
          <Card>
            <h3 className="mb-2 font-bold text-slate-700">المصروفات</h3>
            <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <tbody>
                {data.expenses.map((r: any) => (
                  <tr key={r.accountId} className="border-b last:border-0">
                    <td className="py-2">{r.accountName}</td>
                    <td className="py-2">{money(r.amount)}</td>
                  </tr>
                ))}
                {data.expenses.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-slate-400">لا توجد مصروفات في هذا المدى</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="py-2">إجمالي المصروفات</td>
                  <td className="py-2">{money(data.totalExpense)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </Card>
          <Card>
            <div className="flex justify-between text-sm text-slate-600">
              <span>تكلفة البضاعة المباعة (COGS)</span>
              <span>{money(data.costOfGoodsSold ?? 0)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 text-sm font-medium text-slate-700">
              <span>إجمالي الربح (Gross Profit)</span>
              <span>{money(data.grossProfit ?? data.totalRevenue)}</span>
            </div>
          </Card>
          <Card className="bg-brand-50">
            <div className="flex justify-between text-base font-bold">
              <span>صافي الربح / الخسارة</span>
              <span className={data.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}>{money(data.netProfit)}</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function BalanceSheetTab() {
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
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل الميزانية العمومية');
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
      <table className="w-full text-right text-sm">
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={r.accountId ?? i} className="border-b last:border-0">
              <td className="py-2">
                {r.accountName}
                {r.computed && <span className="mr-2 text-xs text-slate-400">(محسوب، غير مُرحَّل بقيد)</span>}
              </td>
              <td className="py-2">{money(r.balance)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="py-4 text-center text-slate-400">لا توجد بنود</td>
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
        <Field label="كما في تاريخ">
          <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={load}>
          تطبيق
        </Button>
      </div>
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
      {!loading && data && (
        <div className="space-y-4">
          {section('الأصول', data.assets)}
          {section('الخصوم', data.liabilities)}
          {section('حقوق الملكية', data.equity)}
          <Card className={data.totals.isBalanced ? 'bg-emerald-50' : 'bg-red-50'}>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>إجمالي الأصول: <span className="font-bold">{money(data.totals.totalAssets)}</span></div>
              <div>الخصوم + حقوق الملكية: <span className="font-bold">{money(data.totals.totalLiabilities + data.totals.totalEquity)}</span></div>
              <div className={data.totals.isBalanced ? 'font-bold text-emerald-700' : 'font-bold text-red-700'}>
                {data.totals.isBalanced ? 'الميزانية متوازنة' : 'الميزانية غير متوازنة'}
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
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>('trial-balance');

  if (!hasPermission('accounting.reports.view')) {
    return <ErrorBanner message="لا تملك صلاحية عرض التقارير المحاسبية" />;
  }

  return (
    <div>
      <PageHeader title="التقارير المحاسبية" />
      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t.key ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'
            }`}
          >
            {t.label}
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
