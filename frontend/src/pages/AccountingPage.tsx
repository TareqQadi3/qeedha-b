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

/**
 * Chart of Accounts + Journal Entries (docs/CHART_OF_ACCOUNTS.md,
 * docs/JOURNAL_ENTRIES.md). Journal entries are read-only here by design -
 * they're only ever posted automatically from Sales/Purchases/Expenses, so
 * there is no "new entry" action on this page (docs/ACCOUNTING.md "No
 * manual double entry").
 */
export function AccountingPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<'accounts' | 'journal'>('accounts');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [accountFormError, setAccountFormError] = useState<string | null>(null);
  const [accountSubmitting, setAccountSubmitting] = useState(false);

  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [entryMeta, setEntryMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [selectedEntry, setSelectedEntry] = useState<JournalEntryRow | null>(null);

  const loadAccounts = async () => {
    const res = await api.get('/accounting/accounts');
    setAccounts(res);
  };

  const loadEntries = async (page = entryMeta.page) => {
    const res = await api.get('/accounting/journal-entries', { page, pageSize: entryMeta.pageSize });
    setEntries(res.data);
    setEntryMeta(res.meta);
  };

  useEffect(() => {
    if (hasPermission('accounting.read')) {
      loadAccounts();
      loadEntries(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      </div>

      {tab === 'accounts' && (
        <div>
          {hasPermission('accounting.manage') && (
            <div className="mb-4 flex justify-end">
              <Button onClick={openAccountModal}>+ حساب جديد</Button>
            </div>
          )}
          <Card>
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
          </Card>
        </div>
      )}

      {tab === 'journal' && (
        <Card>
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
          <Pagination
            page={entryMeta.page}
            pageSize={entryMeta.pageSize}
            total={entryMeta.total}
            onChange={loadEntries}
          />
        </Card>
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
        )}
      </Modal>
    </div>
  );
}
