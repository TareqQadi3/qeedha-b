import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatDate, formatDateTime } from '../utils/formatDate';

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

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

interface BankReconciliation {
  id: string;
  accountCode: string;
  asOfDate: string;
  statementBalance: string;
  bookBalance: string;
  difference: string;
  notes: string | null;
  createdAt: string;
}

const emptyReconciliationForm = { accountCode: '1010', asOfDate: '', statementBalance: '', notes: '' };
const RECONCILIATION_ACCOUNT_KEYS: Record<string, string> = { '1010': 'reconciliationAccounts.cash', '1020': 'reconciliationAccounts.bank' };

/**
 * Chart of Accounts + Journal Entries (docs/CHART_OF_ACCOUNTS.md,
 * docs/JOURNAL_ENTRIES.md). Journal entries are read-only here by design -
 * they're only ever posted automatically from Sales/Purchases/Expenses, so
 * there is no "new entry" action on this page (docs/ACCOUNTING.md "No
 * manual double entry").
 */
export function AccountingPage() {
  const { t } = useTranslation('accounting');
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<'accounts' | 'journal' | 'opening-balance' | 'periods' | 'reconciliation'>(
    'accounts',
  );

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

  const [reconciliations, setReconciliations] = useState<BankReconciliation[]>([]);
  const [reconciliationsLoading, setReconciliationsLoading] = useState(false);
  const [reconciliationsError, setReconciliationsError] = useState<string | null>(null);
  const [reconciliationModalOpen, setReconciliationModalOpen] = useState(false);
  const [reconciliationForm, setReconciliationForm] = useState(emptyReconciliationForm);
  const [reconciliationFormError, setReconciliationFormError] = useState<string | null>(null);
  const [reconciliationSubmitting, setReconciliationSubmitting] = useState(false);

  const loadAccounts = async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      setAccounts(await api.get('/accounting/accounts'));
    } catch (err) {
      setAccountsError(err instanceof ApiError ? err.message : t('errors.loadAccountsFailed'));
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
      setEntriesError(err instanceof ApiError ? err.message : t('errors.loadEntriesFailed'));
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
      setObError(err instanceof ApiError ? err.message : t('errors.loadOpeningBalanceFailed'));
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
      setPeriodsError(err instanceof ApiError ? err.message : t('errors.loadPeriodsFailed'));
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

  const loadReconciliations = async () => {
    setReconciliationsLoading(true);
    setReconciliationsError(null);
    try {
      setReconciliations(await api.get('/accounting/reconciliations'));
    } catch (err) {
      setReconciliationsError(err instanceof ApiError ? err.message : t('errors.loadReconciliationsFailed'));
    } finally {
      setReconciliationsLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'opening-balance' && hasPermission('accounting.read')) loadOpeningBalance();
    if (tab === 'periods' && hasPermission('accounting.read')) loadPeriods();
    if (tab === 'reconciliation' && hasPermission('accounting.read')) loadReconciliations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const openReconciliationModal = () => {
    setReconciliationForm(emptyReconciliationForm);
    setReconciliationFormError(null);
    setReconciliationModalOpen(true);
  };

  const onCreateReconciliation = async (e: FormEvent) => {
    e.preventDefault();
    setReconciliationFormError(null);
    setReconciliationSubmitting(true);
    try {
      await api.post('/accounting/reconciliations', {
        accountCode: reconciliationForm.accountCode,
        asOfDate: reconciliationForm.asOfDate,
        statementBalance: Number(reconciliationForm.statementBalance),
        notes: reconciliationForm.notes || undefined,
      });
      setReconciliationModalOpen(false);
      await loadReconciliations();
    } catch (err) {
      setReconciliationFormError(err instanceof ApiError ? err.message : t('errors.createReconciliationFailed'));
    } finally {
      setReconciliationSubmitting(false);
    }
  };

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
      setObFormError(err instanceof ApiError ? err.message : t('errors.createOpeningBalanceFailed'));
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
      setObError(err instanceof ApiError ? err.message : t('errors.reverseOpeningBalanceFailed'));
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
      setPeriodFormError(err instanceof ApiError ? err.message : t('errors.createPeriodFailed'));
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
      setPeriodsError(err instanceof ApiError ? err.message : t('errors.togglePeriodFailed'));
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
      setAccountFormError(err instanceof ApiError ? err.message : t('errors.createAccountFailed'));
    } finally {
      setAccountSubmitting(false);
    }
  };

  const lineTotal = (lines: JournalLine[], side: 'debit' | 'credit') =>
    lines.reduce((s, l) => s + Number(l[side]), 0).toFixed(2);

  if (!hasPermission('accounting.read')) {
    return <ErrorBanner message={t('noReadPermission')} />;
  }

  return (
    <div>
      <PageHeader title={t('pageTitle')} />

      <div className="mb-4 flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('accounts')}
          className={`px-3 py-2 text-sm font-medium ${
            tab === 'accounts' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'
          }`}
        >
          {t('tabs.accounts')}
        </button>
        <button
          type="button"
          onClick={() => setTab('journal')}
          className={`px-3 py-2 text-sm font-medium ${
            tab === 'journal' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'
          }`}
        >
          {t('tabs.journal')}
        </button>
        <button
          type="button"
          onClick={() => setTab('opening-balance')}
          className={`px-3 py-2 text-sm font-medium ${
            tab === 'opening-balance' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'
          }`}
        >
          {t('tabs.openingBalance')}
        </button>
        <button
          type="button"
          onClick={() => setTab('periods')}
          className={`px-3 py-2 text-sm font-medium ${
            tab === 'periods' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'
          }`}
        >
          {t('tabs.periods')}
        </button>
        <button
          type="button"
          onClick={() => setTab('reconciliation')}
          className={`px-3 py-2 text-sm font-medium ${
            tab === 'reconciliation' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500'
          }`}
        >
          {t('tabs.reconciliation')}
        </button>
      </div>

      {tab === 'accounts' && (
        <div>
          {hasPermission('accounting.manage') && (
            <div className="mb-4 flex justify-end">
              <Button onClick={openAccountModal}>{t('actions.newAccount')}</Button>
            </div>
          )}
          <ErrorBanner message={accountsError} />
          {accountsLoading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
          {!accountsLoading && (
          <Card>
            <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('table.accounts.code')}</th>
                  <th className="py-2">{t('table.accounts.name')}</th>
                  <th className="py-2">{t('table.accounts.type')}</th>
                  <th className="py-2">{t('table.accounts.parent')}</th>
                  <th className="py-2">{t('table.accounts.status')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{a.code}</td>
                    <td className="py-2">{a.name}</td>
                    <td className="py-2 text-slate-500">{t(`types.${a.type}`)}</td>
                    <td className="py-2 text-slate-500">{accountName(a.parentId)}</td>
                    <td className="py-2">
                      <span className={a.isActive ? 'text-emerald-600' : 'text-slate-400'}>
                        {a.isActive ? t('status.active') : t('status.inactive')}
                      </span>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      {t('empty.accounts')}
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
          {entriesLoading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
          {!entriesLoading && (
          <Card>
            <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('table.journal.date')}</th>
                  <th className="py-2">{t('table.journal.source')}</th>
                  <th className="py-2">{t('table.journal.description')}</th>
                  <th className="py-2">{t('table.journal.debit')}</th>
                  <th className="py-2">{t('table.journal.credit')}</th>
                  <th className="py-2">{t('table.journal.status')}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-2 text-slate-500">{formatDateTime(new Date(entry.postedAt))}</td>
                    <td className="py-2 text-slate-500">{entry.referenceType}</td>
                    <td className="py-2">{entry.description ?? '—'}</td>
                    <td className="py-2">{lineTotal(entry.lines, 'debit')}</td>
                    <td className="py-2">{lineTotal(entry.lines, 'credit')}</td>
                    <td className="py-2">
                      <span className={entry.status === 'posted' ? 'text-emerald-600' : 'text-slate-400'}>
                        {entry.status === 'posted' ? t('status.posted') : t('status.reversed')}
                      </span>
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedEntry(entry)}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        {t('actions.viewDetails')}
                      </button>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">
                      {t('empty.journalEntries')}
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
          {obLoading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
          {!obLoading && !openingBalance && (
            <Card>
              <div className="py-6 text-center text-slate-400">
                {t('empty.openingBalance')}
              </div>
              {hasPermission('accounting.opening_balance.manage') && (
                <div className="flex justify-center">
                  <Button onClick={openObModal}>{t('actions.recordOpeningBalance')}</Button>
                </div>
              )}
            </Card>
          )}
          {!obLoading && openingBalance && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  {t('openingBalance.postedOn', { date: formatDateTime(new Date(openingBalance.postedAt)) })}
                </span>
                {hasPermission('accounting.opening_balance.manage') && (
                  <Button variant="danger" onClick={onReverseOpeningBalance}>
                    {t('actions.reverseOpeningBalance')}
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2">{t('table.openingBalance.account')}</th>
                    <th className="py-2">{t('table.openingBalance.debit')}</th>
                    <th className="py-2">{t('table.openingBalance.credit')}</th>
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
              <Button onClick={openPeriodModal}>{t('actions.newPeriod')}</Button>
            </div>
          )}
          {periodsLoading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
          {!periodsLoading && (
            <Card>
              <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2">{t('table.periods.name')}</th>
                    <th className="py-2">{t('table.periods.from')}</th>
                    <th className="py-2">{t('table.periods.to')}</th>
                    <th className="py-2">{t('table.periods.status')}</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2">{p.name}</td>
                      <td className="py-2 text-slate-500">{formatDate(new Date(p.startDate))}</td>
                      <td className="py-2 text-slate-500">{formatDate(new Date(p.endDate))}</td>
                      <td className="py-2">
                        <span className={p.status === 'open' ? 'text-emerald-600' : 'text-slate-400'}>
                          {p.status === 'open' ? t('status.open') : t('status.closed')}
                        </span>
                      </td>
                      <td className="py-2">
                        {hasPermission('accounting.period.manage') && (
                          <button
                            type="button"
                            onClick={() => onTogglePeriod(p)}
                            className="text-xs text-brand-600 hover:underline"
                          >
                            {p.status === 'open' ? t('actions.closePeriod') : t('actions.reopenPeriod')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {periods.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        {t('empty.periods')}
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

      {tab === 'reconciliation' && (
        <div>
          <ErrorBanner message={reconciliationsError} />
          {hasPermission('accounting.reconciliation.manage') && (
            <div className="mb-4 flex justify-end">
              <Button onClick={openReconciliationModal}>{t('actions.newReconciliation')}</Button>
            </div>
          )}
          {reconciliationsLoading && (
            <div className="py-6 text-center text-slate-400">{t('loading')}</div>
          )}
          {!reconciliationsLoading && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2">{t('table.reconciliation.account')}</th>
                      <th className="py-2">{t('table.reconciliation.asOfDate')}</th>
                      <th className="py-2">{t('table.reconciliation.statementBalance')}</th>
                      <th className="py-2">{t('table.reconciliation.bookBalance')}</th>
                      <th className="py-2">{t('table.reconciliation.difference')}</th>
                      <th className="py-2">{t('table.reconciliation.notes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliations.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2">
                          {RECONCILIATION_ACCOUNT_KEYS[r.accountCode] ? t(RECONCILIATION_ACCOUNT_KEYS[r.accountCode]) : r.accountCode}
                        </td>
                        <td className="py-2 text-slate-500">{formatDate(new Date(r.asOfDate))}</td>
                        <td className="py-2">{Number(r.statementBalance).toFixed(2)}</td>
                        <td className="py-2">{Number(r.bookBalance).toFixed(2)}</td>
                        <td
                          className={`py-2 font-medium ${
                            Number(r.difference) === 0 ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                        >
                          {Number(r.difference).toFixed(2)}
                        </td>
                        <td className="py-2 text-slate-500">{r.notes ?? '—'}</td>
                      </tr>
                    ))}
                    {reconciliations.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          {t('empty.reconciliations')}
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

      <Modal open={accountModalOpen} onClose={() => setAccountModalOpen(false)} title={t('modals.newAccount.title')}>
        <form onSubmit={onCreateAccount} className="space-y-3">
          <ErrorBanner message={accountFormError} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.code')}>
              <Input value={accountForm.code} onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })} required />
            </Field>
            <Field label={t('fields.type')}>
              <Select
                value={accountForm.type}
                onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value as AccountType })}
              >
                {ACCOUNT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`types.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t('fields.name')}>
            <Input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} required />
          </Field>
          <Field label={t('fields.parentAccount')}>
            <Select value={accountForm.parentId} onChange={(e) => setAccountForm({ ...accountForm, parentId: e.target.value })}>
              <option value="">{t('fields.none')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" className="w-full" disabled={accountSubmitting}>
            {accountSubmitting ? t('saving') : t('actions.saveAccount')}
          </Button>
        </form>
      </Modal>

      <Modal open={selectedEntry !== null} onClose={() => setSelectedEntry(null)} title={t('modals.entryDetails.title')}>
        {selectedEntry && (
          <div className="space-y-3">
            <div className="text-sm text-slate-500">{selectedEntry.description}</div>
            <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('table.openingBalance.account')}</th>
                  <th className="py-2">{t('table.openingBalance.debit')}</th>
                  <th className="py-2">{t('table.openingBalance.credit')}</th>
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
                  <td className="py-2">{t('table.total')}</td>
                  <td className="py-2">{lineTotal(selectedEntry.lines, 'debit')}</td>
                  <td className="py-2">{lineTotal(selectedEntry.lines, 'credit')}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={obModalOpen} onClose={() => setObModalOpen(false)} title={t('modals.recordOpeningBalance.title')}>
        <form onSubmit={onCreateOpeningBalance} className="space-y-3">
          <ErrorBanner message={obFormError} />
          {obLines.map((line, i) => (
            <div key={i} className="grid grid-cols-4 gap-2">
              <div className="col-span-2">
                <Select value={line.accountId} onChange={(e) => updateObLine(i, { accountId: e.target.value })}>
                  <option value="">{t('fields.selectAccount')}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Input
                placeholder={t('fields.debit')}
                type="number"
                min="0"
                step="0.01"
                value={line.debit}
                onChange={(e) => updateObLine(i, { debit: e.target.value, credit: '' })}
              />
              <Input
                placeholder={t('fields.credit')}
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
                  className="col-span-4 text-start text-xs text-red-500 hover:underline"
                >
                  {t('actions.deleteLine')}
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addObLine} className="text-xs text-brand-600 hover:underline">
            {t('actions.addLine')}
          </button>
          <Button type="submit" className="w-full" disabled={obSubmitting}>
            {obSubmitting ? t('saving') : t('actions.postOpeningBalance')}
          </Button>
        </form>
      </Modal>

      <Modal open={periodModalOpen} onClose={() => setPeriodModalOpen(false)} title={t('modals.newPeriod.title')}>
        <form onSubmit={onCreatePeriod} className="space-y-3">
          <ErrorBanner message={periodFormError} />
          <Field label={t('fields.name')}>
            <Input value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.startDate')}>
              <Input
                type="date"
                value={periodForm.startDate}
                onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                required
              />
            </Field>
            <Field label={t('fields.endDate')}>
              <Input
                type="date"
                value={periodForm.endDate}
                onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                required
              />
            </Field>
          </div>
          <Button type="submit" className="w-full" disabled={periodSubmitting}>
            {periodSubmitting ? t('saving') : t('actions.createPeriod')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={reconciliationModalOpen}
        onClose={() => setReconciliationModalOpen(false)}
        title={t('modals.newReconciliation.title')}
      >
        <form onSubmit={onCreateReconciliation} className="space-y-3">
          <ErrorBanner message={reconciliationFormError} />
          <p className="text-xs text-slate-500">{t('modals.newReconciliation.helpText')}</p>
          <Field label={t('fields.account')}>
            <Select
              value={reconciliationForm.accountCode}
              onChange={(e) => setReconciliationForm({ ...reconciliationForm, accountCode: e.target.value })}
            >
              <option value="1010">{t('reconciliationAccounts.cash')}</option>
              <option value="1020">{t('reconciliationAccounts.bank')}</option>
            </Select>
          </Field>
          <Field label={t('fields.asOfDate')}>
            <Input
              type="date"
              value={reconciliationForm.asOfDate}
              onChange={(e) => setReconciliationForm({ ...reconciliationForm, asOfDate: e.target.value })}
              required
            />
          </Field>
          <Field label={t('fields.statementBalance')}>
            <Input
              type="number"
              step="0.01"
              value={reconciliationForm.statementBalance}
              onChange={(e) =>
                setReconciliationForm({ ...reconciliationForm, statementBalance: e.target.value })
              }
              required
            />
          </Field>
          <Field label={t('fields.notes')}>
            <Input
              value={reconciliationForm.notes}
              onChange={(e) => setReconciliationForm({ ...reconciliationForm, notes: e.target.value })}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={reconciliationSubmitting}>
            {reconciliationSubmitting ? t('saving') : t('actions.recordReconciliation')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
