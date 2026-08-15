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

interface Branch {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface ExpenseRow {
  id: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  description: string | null;
  status: 'recorded' | 'cancelled';
  branchId: string | null;
  category: { name: string };
  createdAt: string;
}

type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدًا',
  card: 'بطاقة',
  transfer: 'تحويل',
  other: 'أخرى',
};

function newClientReferenceId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const emptyForm = {
  categoryId: '',
  branchId: '',
  amount: '',
  paymentMethod: 'cash' as PaymentMethod,
  description: '',
};

/** Expenses screen (docs/EXPENSES.md). Editing amount/category/payment method reverses the old journal entry and posts a fresh one - see docs/ACCOUNTING.md. */
export function ExpensesPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [data, setData] = useState<ExpenseRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async (page = meta.page) => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await api.get('/expenses', { page, pageSize: meta.pageSize });
      setData(res.data);
      setMeta(res.meta);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'تعذّر تحميل المصروفات');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    api.get('/tenancy/branches').then((r) => setBranches(r)).catch(() => undefined);
    api.get('/expenses/categories').then((r) => setCategories(r)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const branchName = (id: string | null) => (id ? (branches.find((b) => b.id === id)?.name ?? '—') : 'الشركة (بدون فرع)');

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (row: ExpenseRow) => {
    setEditingId(row.id);
    setForm({
      categoryId: '',
      branchId: row.branchId ?? '',
      amount: row.amount,
      paymentMethod: row.paymentMethod as PaymentMethod,
      description: row.description ?? '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      if (editingId) {
        await api.patch(`/expenses/${editingId}`, {
          branchId: form.branchId || undefined,
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          description: form.description || undefined,
        });
      } else {
        await api.post('/expenses', {
          categoryId: form.categoryId,
          branchId: form.branchId || undefined,
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          description: form.description || undefined,
          clientReferenceId: newClientReferenceId(),
        });
      }
      setModalOpen(false);
      await load(editingId ? meta.page : 1);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذّر حفظ المصروف');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteExpense = async (id: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api.delete(`/expenses/${id}`);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذّر حذف المصروف');
    } finally {
      setBusyId(null);
    }
  };

  if (!hasPermission('expenses.read')) {
    return <ErrorBanner message="لا تملك صلاحية عرض المصروفات" />;
  }

  return (
    <div>
      <PageHeader
        title="المصروفات"
        action={hasPermission('expenses.create') && <Button onClick={openCreateModal}>+ مصروف جديد</Button>}
      />

      <ErrorBanner message={actionError} />
      <ErrorBanner message={listError} />
      {listLoading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
      {!listLoading && (
      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2">الفئة</th>
              <th className="py-2">الفرع</th>
              <th className="py-2">المبلغ</th>
              <th className="py-2">طريقة الدفع</th>
              <th className="py-2">الوصف</th>
              <th className="py-2">الحالة</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="py-2">{row.category.name}</td>
                <td className="py-2 text-slate-500">{branchName(row.branchId)}</td>
                <td className="py-2 font-medium">
                  {row.amount} {row.currency}
                </td>
                <td className="py-2 text-slate-500">
                  {PAYMENT_METHOD_LABELS[row.paymentMethod as PaymentMethod] ?? row.paymentMethod}
                </td>
                <td className="py-2 text-slate-500">{row.description ?? '—'}</td>
                <td className="py-2">
                  <span className={row.status === 'recorded' ? 'text-emerald-600' : 'text-red-500'}>
                    {row.status === 'recorded' ? 'مسجَّل' : 'محذوف'}
                  </span>
                </td>
                <td className="py-2">
                  {row.status === 'recorded' && (
                    <div className="flex gap-2">
                      {hasPermission('expenses.update') && (
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          تعديل
                        </button>
                      )}
                      {hasPermission('expenses.delete') && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => deleteExpense(row.id)}
                          className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  لا توجد مصروفات بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onChange={load} />
      </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'تعديل مصروف' : 'مصروف جديد'}>
        <form onSubmit={onSubmit} className="space-y-3">
          <ErrorBanner message={formError} />
          {!editingId && (
            <Field label="الفئة">
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
                <option value="">اختر فئة</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="الفرع (اختياري - اتركه فارغًا لمصروف على مستوى الشركة)">
            <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">بدون فرع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المبلغ">
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </Field>
            <Field label="طريقة الدفع">
              <Select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="الوصف (اختياري)">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? '...جارٍ الحفظ' : 'حفظ'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
