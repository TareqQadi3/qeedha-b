import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
} from '../components/ui';
import { useAuth } from '../state/auth';

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
const TYPE_LABELS: Record<AccountType, string> = {
  asset: 'أصول',
  liability: 'التزامات',
  equity: 'حقوق ملكية',
  revenue: 'إيرادات',
  expense: 'مصروفات',
};

interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  isActive: boolean;
}

interface JournalLine {
  id: string;
  debit: string;
  credit: string;
  account: { code: string; name: string };
}

interface JournalEntryRow {
  id: string;
  status: 'posted' | 'reversed';
  referenceType: string;
  referenceId: string;
  description: string | null;
  postedAt: string;
  reversalOfEntryId: string | null;
  lines: JournalLine[];
}

const emptyAccountForm = { code: '', name: '', type: 'expense' as AccountType, parentId: '' };

interface OpeningBalanceLine {
  id: string;
  debit: string;
  credit: string;
  account: { code: string; name: string };
}

interface OpeningBalanceEntry {
  id: string;
  postedAt: string;
  lines: OpeningBalanceLine[];
}

type FiscalPeriodStatus = 'open' | 'closed';
interface FiscalPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
}

const emptyObLineForm = { accountId: '', debit: '', credit: '' };
const emptyPeriodForm = { name: '', startDate: '', endDate: '' };

/**
 * Chart of Accounts + Journal Entries (docs/CHART_OF_ACCOUNTS.md,
 * docs/JOURNAL_ENTRIES.md). Journal entries are read-only here by design -
 * they're only ever posted automatically from Sales/Purchases/Expenses, so
 * there is no "new entry" action on this page (docs/ACCOUNTING.md "No
 * manual double entry").
 */
export function AccountingPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<'accounts' | 'journal' | 'opening-balance' | 'periods'>('accounts');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [accountFormError, setAccountFormError] = useState<string | null>(null);
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [entryMeta, setEntryMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [selectedEntry, setSelectedEntry] = useState<JournalEntryRow | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  const [openingBalance, setOpeningBalance] = useState<OpeningBalanceEntry | null>(null);
  const [obLoading, setObLoading] = useState(false);
  const [obError, setObError] = useState<string | null>(null);
  const [obModalOpen, setObModalOpen] = useState(false);
  const [obLines, setObLines] = useState([{ ...emptyObLineForm }, { ...emptyObLineForm }]);
  const [obFormError, setObFormError] = useState<string | null>(null);
  const [obSubmitting, setObSubmitting] = useState(false);

  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [periodForm, setPeriodForm] = useState(emptyPeriodForm);
  const [periodFormError, setPeriodFormError] = useState<string | null>(null);
  const [periodSubmitting, setPeriodSubmitting] = useState(false);

  const loadAccounts = async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      setAccounts(await api.get('/accounting/accounts'));
    } catch (err) {
      setAccountsError(err instanceof ApiError ? err.message : 'تعذّر تحميل دليل الحسابات');
    } finally {
      setAccountsLoading(false);
    }
  };

  const loadEntries = async (page = entryMeta.page) => {
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const res = await api.get('/accounting/journal-entries', { page, pageSize: entryMeta.pageSize });
      setEntries(res.data);
      setEntryMeta(res.meta);
    } catch (err) {
      setEntriesError(err instanceof ApiError ? err.message : 'تعذّر تحميل القيود المحاسبية');
    } finally {
      setEntriesLoading(false);
    }
  };

  const loadOpeningBalance = async () => {
    setObLoading(true);
    setObError(null);
    try {
      const res = await api.get('/accounting/opening-balance');
      setOpeningBalance(res);
    } catch (err) {
      setObError(err instanceof ApiError ? err.message : 'تعذّر تحميل الرصيد الافتتاحي');
    } finally {
      setObLoading(false);
    }
  };

  const loadPeriods = async () => {
    setPeriodsLoading(true);
    setPeriodsError(null);
    try {
      const res = await api.get('/accounting/fiscal-periods');
      setPeriods(res);
    } catch (err) {
      setPeriodsError(err instanceof ApiError ? err.message : 'تعذّر تحميل الفترات المحاسبية');
    } finally {
      setPeriodsLoading(false);
    }
  };

  useEffect(() => {
    if (hasPermission('accounting.read')) {
      loadAccounts();
      loadEntries(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'opening-balance' && hasPermission('accounting.read')) loadOpeningBalance();
    if (tab === 'periods' && hasPermission('accounting.read')) loadPeriods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const openObModal = () => {
    setObLines([{ ...emptyObLineForm }, { ...emptyObLineForm }]);
    setObFormError(null);
    setObModalOpen(true);
  };

  const updateObLine = (index: number, patch: Partial<typeof emptyObLineForm>) => {
    setObLines((lines) => lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const addObLine = () => setObLines((lines) => [...lines, { ...emptyObLineForm }]);
  const removeObLine = (index: number) => setObLines((lines) => lines.filter((_, i) => i !== index));

  const onCreateOpeningBalance = async (e: FormEvent) => {
    e.preventDefault();
    setObFormError(null);
    setObSubmitting(true);
    try {
      const lines = obLines
        .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map((l) => ({
          accountId: l.accountId,
          ...(Number(l.debit) > 0 ? { debit: Number(l.debit) } : {}),
          ...(Number(l.credit) > 0 ? { credit: Number(l.credit) } : {}),
        }));
      await api.post('/accounting/opening-balance', { lines });
      setObModalOpen(false);
      await loadOpeningBalance();
    } catch (err) {
      setObFormError(err instanceof ApiError ? err.message : 'تعذّر تسجيل الرصيد الافتتاحي');
    } finally {
      setObSubmitting(false);
    }
  };

  const onReverseOpeningBalance = async () => {
    setObError(null);
    try {
      await api.post('/accounting/opening-balance/reverse');
      await loadOpeningBalance();
    } catch (err) {
      setObError(err instanceof ApiError ? err.message : 'تعذّر عكس الرصيد الافتتاحي');
    }
  };

  const openPeriodModal = () => {
    setPeriodForm(emptyPeriodForm);
    setPeriodFormError(null);
    setPeriodModalOpen(true);
  };

  const onCreatePeriod = async (e: FormEvent) => {
    e.preventDefault();
    setPeriodFormError(null);
    setPeriodSubmitting(true);
    try {
      await api.post('/accounting/fiscal-periods', periodForm);
      setPeriodModalOpen(false);
      await loadPeriods();
    } catch (err) {
      setPeriodFormError(err instanceof ApiError ? err.message : 'تعذّر إنشاء الفترة المحاسبية');
    } finally {
      setPeriodSubmitting(false);
    }
  };

  const onTogglePeriod = async (period: FiscalPeriod) => {
    setPeriodsError(null);
    try {
      await api.post(`/accounting/fiscal-periods/${period.id}/${period.status === 'open' ? 'close' : 'reopen'}`);
      await loadPeriods();
    } catch (err) {
      setPeriodsError(err instanceof ApiError ? err.message : 'تعذّر تحديث حالة الفترة');
    }
  };

  const accountName = (id: string | null) => (id ? (accounts.find((a) => a.id === id)?.name ?? '—') : '—');

  const openAccountModal = () => {
    setAccountForm(emptyAccountForm);
    setAccountFormError(null);
    setAccountModalOpen(true);
  };

  const onCreateAccount = async (e: FormEvent) => {
    e.preventDefault();
    setAccountFormError(null);
    setAccountSubmitting(true);
    try {
      await api.post('/accounting/accounts', {
        code: accountForm.code,
        name: accountForm.name,
        type: accountForm.type,
        parentId: accountForm.parentId || undefined,
      });
      setAccountModalOpen(false);
      await loadAccounts();
    } catch (err) {
      setAccountFormError(err instanceof ApiError ? err.message : 'تعذّر إنشاء الحساب');
    } finally {
      setAccountSubmitting(false);
    }
  };

  const lineTotal = (lines: JournalLine[], side: 'debit' | 'credit') =>
    lines.reduce((s, l) => s + Number(l[side]), 0).toFixed(2);

  if (!hasPermission('accounting.read')) {
    return <ErrorBanner message="لا تملك صلاحية عرض الحسابات" />;
  }

  return (
    <div>
      <PageHeader title="الحسابات والقيود المحاسبية" />

      <div className="mb-4 flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('accounts')}
          className={`px-3 py-2 text-sm font-medium ${
            tab === 'accounts' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'
          }`}
        >
          دليل الحسابات
        </button>
        <button
          type="button"
          onClick={() => setTab('journal')}
          className={`px-3 py-2 text-sm font-medium ${
            tab === 'journal' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'
          }`}
        >
          القيود المحاسبية
        </button>
        <button
          type="button"
          onClick={() => setTab('opening-balance')}
          className={`px-3 py-2 text-sm font-medium ${
            tab === 'opening-balance' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'
          }`}
        >
          الأرصدة الافتتاحية
        </button>
        <button
          type="button"
          onClick={() => setTab('periods')}
          className={`px-3 py-2 text-sm font-medium ${
            tab === 'periods' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'
          }`}
        >
          الفترات المحاسبية
        </button>
      </div>

      {tab === 'accounts' && (
        <div>
          {hasPermission('accounting.manage') && (
            <div className="mb-4 flex justify-end">
              <Button onClick={openAccountModal}>+ حساب جديد</Button>
            </div>
          )}
          <ErrorBanner message={accountsError} />
          {accountsLoading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
          {!accountsLoading && (
          <Card>
            <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">الرمز</th>
                  <th className="py-2">الاسم</th>
                  <th className="py-2">النوع</th>
                  <th className="py-2">الحساب الأب</th>
                  <th className="py-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{a.code}</td>
                    <td className="py-2">{a.name}</td>
                    <td className="py-2 text-slate-500">{TYPE_LABELS[a.type]}</td>
                    <td className="py-2 text-slate-500">{accountName(a.parentId)}</td>
                    <td className="py-2">
                      <span className={a.isActive ? 'text-emerald-600' : 'text-slate-400'}>
                        {a.isActive ? 'نشط' : 'معطّل'}
                      </span>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      لا توجد حسابات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </Card>
          )}
        </div>
      )}

      {tab === 'journal' && (
        <div>
          <ErrorBanner message={entriesError} />
          {entriesLoading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
          {!entriesLoading && (
          <Card>
            <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">التاريخ</th>
                  <th className="py-2">المصدر</th>
                  <th className="py-2">الوصف</th>
                  <th className="py-2">مدين</th>
                  <th className="py-2">دائن</th>
                  <th className="py-2">الحالة</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-2 text-slate-500">{new Date(entry.postedAt).toLocaleString('ar-SA')}</td>
                    <td className="py-2 text-slate-500">{entry.referenceType}</td>
                    <td className="py-2">{entry.description ?? '—'}</td>
                    <td className="py-2">{lineTotal(entry.lines, 'debit')}</td>
                    <td className="py-2">{lineTotal(entry.lines, 'credit')}</td>
                    <td className="py-2">
                      <span className={entry.status === 'posted' ? 'text-emerald-600' : 'text-slate-400'}>
                        {entry.status === 'posted' ? 'مُرحَّل' : 'مُعكوس'}
                      </span>
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedEntry(entry)}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        عرض التفاصيل
                      </button>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">
                      لا توجد قيود محاسبية بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            <Pagination
              page={entryMeta.page}
              pageSize={entryMeta.pageSize}
              total={entryMeta.total}
              onChange={loadEntries}
            />
          </Card>
          )}
        </div>
      )}

      {tab === 'opening-balance' && (
        <div>
          <ErrorBanner message={obError} />
          {obLoading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
          {!obLoading && !openingBalance && (
            <Card>
              <div className="py-6 text-center text-slate-400">
                لا يوجد رصيد افتتاحي مُرحَّل لهذه المنشأة بعد
              </div>
              {hasPermission('accounting.opening_balance.manage') && (
                <div className="flex justify-center">
                  <Button onClick={openObModal}>+ تسجيل رصيد افتتاحي</Button>
                </div>
              )}
            </Card>
          )}
          {!obLoading && openingBalance && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  رُحِّل في {new Date(openingBalance.postedAt).toLocaleString('ar-SA')}
                </span>
                {hasPermission('accounting.opening_balance.manage') && (
                  <Button variant="danger" onClick={onReverseOpeningBalance}>
                    عكس الرصيد الافتتاحي
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2">الحساب</th>
                    <th className="py-2">مدين</th>
                    <th className="py-2">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {openingBalance.lines.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2">
                        {l.account.name} <span className="font-mono text-xs text-slate-400">({l.account.code})</span>
                      </td>
                      <td className="py-2">{Number(l.debit) > 0 ? l.debit : '—'}</td>
                      <td className="py-2">{Number(l.credit) > 0 ? l.credit : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'periods' && (
        <div>
          <ErrorBanner message={periodsError} />
          {hasPermission('accounting.period.manage') && (
            <div className="mb-4 flex justify-end">
              <Button onClick={openPeriodModal}>+ فترة محاسبية جديدة</Button>
            </div>
          )}
          {periodsLoading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
          {!periodsLoading && (
            <Card>
              <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2">الاسم</th>
                    <th className="py-2">من</th>
                    <th className="py-2">إلى</th>
                    <th className="py-2">الحالة</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2">{p.name}</td>
                      <td className="py-2 text-slate-500">{new Date(p.startDate).toLocaleDateString('ar-SA')}</td>
                      <td className="py-2 text-slate-500">{new Date(p.endDate).toLocaleDateString('ar-SA')}</td>
                      <td className="py-2">
                        <span className={p.status === 'open' ? 'text-emerald-600' : 'text-slate-400'}>
                          {p.status === 'open' ? 'مفتوحة' : 'مُقفلة'}
                        </span>
                      </td>
                      <td className="py-2">
                        {hasPermission('accounting.period.manage') && (
                          <button
                            type="button"
                            onClick={() => onTogglePeriod(p)}
                            className="text-xs text-brand-600 hover:underline"
                          >
                            {p.status === 'open' ? 'إقفال' : 'إعادة فتح'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {periods.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        لا توجد فترات محاسبية بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </Card>
          )}
        </div>
      )}

      <Modal open={accountModalOpen} onClose={() => setAccountModalOpen(false)} title="حساب جديد">
        <form onSubmit={onCreateAccount} className="space-y-3">
          <ErrorBanner message={accountFormError} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="الرمز">
              <Input value={accountForm.code} onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })} required />
            </Field>
            <Field label="النوع">
              <Select
                value={accountForm.type}
                onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value as AccountType })}
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="الاسم">
            <Input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} required />
          </Field>
          <Field label="الحساب الأب (اختياري)">
            <Select value={accountForm.parentId} onChange={(e) => setAccountForm({ ...accountForm, parentId: e.target.value })}>
              <option value="">بدون</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" className="w-full" disabled={accountSubmitting}>
            {accountSubmitting ? '...جارٍ الحفظ' : 'حفظ الحساب'}
          </Button>
        </form>
      </Modal>

      <Modal open={selectedEntry !== null} onClose={() => setSelectedEntry(null)} title="تفاصيل القيد">
        {selectedEntry && (
          <div className="space-y-3">
            <div className="text-sm text-slate-500">{selectedEntry.description}</div>
            <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">الحساب</th>
                  <th className="py-2">مدين</th>
                  <th className="py-2">دائن</th>
                </tr>
              </thead>
              <tbody>
                {selectedEntry.lines.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2">
                      {l.account.name} <span className="font-mono text-xs text-slate-400">({l.account.code})</span>
                    </td>
                    <td className="py-2">{Number(l.debit) > 0 ? l.debit : '—'}</td>
                    <td className="py-2">{Number(l.credit) > 0 ? l.credit : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium text-slate-800">
                  <td className="py-2">الإجمالي</td>
                  <td className="py-2">{lineTotal(selectedEntry.lines, 'debit')}</td>
                  <td className="py-2">{lineTotal(selectedEntry.lines, 'credit')}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={obModalOpen} onClose={() => setObModalOpen(false)} title="تسجيل رصيد افتتاحي">
        <form onSubmit={onCreateOpeningBalance} className="space-y-3">
          <ErrorBanner message={obFormError} />
          {obLines.map((line, i) => (
            <div key={i} className="grid grid-cols-4 gap-2">
              <div className="col-span-2">
                <Select value={line.accountId} onChange={(e) => updateObLine(i, { accountId: e.target.value })}>
                  <option value="">اختر حسابًا</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Input
                placeholder="مدين"
                type="number"
                min="0"
                step="0.01"
                value={line.debit}
                onChange={(e) => updateObLine(i, { debit: e.target.value, credit: '' })}
              />
              <Input
                placeholder="دائن"
                type="number"
                min="0"
                step="0.01"
                value={line.credit}
                onChange={(e) => updateObLine(i, { credit: e.target.value, debit: '' })}
              />
              {obLines.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeObLine(i)}
                  className="col-span-4 text-right text-xs text-red-500 hover:underline"
                >
                  حذف السطر
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addObLine} className="text-xs text-brand-600 hover:underline">
            + إضافة سطر
          </button>
          <Button type="submit" className="w-full" disabled={obSubmitting}>
            {obSubmitting ? '...جارٍ الحفظ' : 'ترحيل الرصيد الافتتاحي'}
          </Button>
        </form>
      </Modal>

      <Modal open={periodModalOpen} onClose={() => setPeriodModalOpen(false)} title="فترة محاسبية جديدة">
        <form onSubmit={onCreatePeriod} className="space-y-3">
          <ErrorBanner message={periodFormError} />
          <Field label="الاسم">
            <Input value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="من تاريخ">
              <Input
                type="date"
                value={periodForm.startDate}
                onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                required
              />
            </Field>
            <Field label="إلى تاريخ">
              <Input
                type="date"
                value={periodForm.endDate}
                onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                required
              />
            </Field>
          </div>
          <Button type="submit" className="w-full" disabled={periodSubmitting}>
            {periodSubmitting ? '...جارٍ الحفظ' : 'إنشاء الفترة'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
