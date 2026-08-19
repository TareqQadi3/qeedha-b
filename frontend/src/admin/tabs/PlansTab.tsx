import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, PageHeader } from '../../components/ui';
import { adminApi } from '../adminApi';

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthlySar: string | null;
  priceAnnualSar: string | null;
  trialDays: number;
  products: string[];
  isRecommended: boolean;
  isActive: boolean;
}

const PRODUCT_KEYS = ['qeedha_b', 'qeedha'] as const;

const emptyForm = {
  code: '',
  name: '',
  description: '',
  priceMonthlySar: '',
  priceAnnualSar: '',
  trialDays: '14',
  products: ['qeedha_b'] as string[],
  isRecommended: false,
};

/** Plans/Packages (admin role only, per PlatformAdminController) - Website phase spec "Packages/Commercial model": never hardcoded in the frontend, always CRUD through this section. */
export function PlansTab() {
  const { t } = useTranslation('admin');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await adminApi.get('/platform-admin/plans'));
    } catch {
      setError(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingId(plan.id);
    setForm({
      code: plan.code,
      name: plan.name,
      description: plan.description ?? '',
      priceMonthlySar: plan.priceMonthlySar ?? '',
      priceAnnualSar: plan.priceAnnualSar ?? '',
      trialDays: String(plan.trialDays),
      products: plan.products,
      isRecommended: plan.isRecommended,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const toggleProduct = (key: string) => {
    setForm((f) => ({
      ...f,
      products: f.products.includes(key) ? f.products.filter((p) => p !== key) : [...f.products, key],
    }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        priceMonthlySar: form.priceMonthlySar ? Number(form.priceMonthlySar) : undefined,
        priceAnnualSar: form.priceAnnualSar ? Number(form.priceAnnualSar) : undefined,
        trialDays: form.trialDays ? Number(form.trialDays) : undefined,
        products: form.products,
        isRecommended: form.isRecommended,
      };
      if (editingId) {
        await adminApi.patch(`/platform-admin/plans/${editingId}`, body);
      } else {
        await adminApi.post('/platform-admin/plans', { ...body, code: form.code });
      }
      setModalOpen(false);
      await load();
    } catch {
      setFormError(t('errors.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title={t('plans.title')} subtitle={t('plans.subtitle')} action={<Button onClick={openCreate}>{t('plans.addButton')}</Button>} />
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">{t('dashboard.loading')}</div>}
      {!loading && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('plans.table.code')}</th>
                  <th className="py-2">{t('plans.table.name')}</th>
                  <th className="py-2">{t('plans.table.priceMonthly')}</th>
                  <th className="py-2">{t('plans.table.priceAnnual')}</th>
                  <th className="py-2">{t('plans.table.trialDays')}</th>
                  <th className="py-2">{t('plans.table.products')}</th>
                  <th className="py-2">{t('plans.table.recommended')}</th>
                  <th className="py-2">{t('plans.table.active')}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs" dir="ltr">
                      {p.code}
                    </td>
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-slate-500">{p.priceMonthlySar ?? '—'}</td>
                    <td className="py-2 text-slate-500">{p.priceAnnualSar ?? '—'}</td>
                    <td className="py-2 tabular-nums text-slate-500">{p.trialDays}</td>
                    <td className="py-2 text-slate-500">{p.products.join(', ')}</td>
                    <td className="py-2">{p.isRecommended && <Badge variant="brand">✓</Badge>}</td>
                    <td className="py-2">
                      <Badge variant={p.isActive ? 'success' : 'danger'}>{p.isActive ? '✓' : '✕'}</Badge>
                    </td>
                    <td className="py-2">
                      <Button variant="secondary" onClick={() => openEdit(p)}>
                        {t('plans.modal.editTitle')}
                      </Button>
                    </td>
                  </tr>
                ))}
                {plans.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-slate-400">
                      {t('plans.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? t('plans.modal.editTitle') : t('plans.modal.createTitle')}>
        <form onSubmit={onSubmit} className="space-y-3">
          <ErrorBanner message={formError} />
          {!editingId && (
            <Field label={t('plans.modal.code')}>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required dir="ltr" />
            </Field>
          )}
          <Field label={t('plans.modal.name')}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label={t('plans.modal.description')}>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label={t('plans.modal.priceMonthly')}>
            <Input
              type="number"
              min={0}
              value={form.priceMonthlySar}
              onChange={(e) => setForm({ ...form, priceMonthlySar: e.target.value })}
              dir="ltr"
            />
          </Field>
          <Field label={t('plans.modal.priceAnnual')}>
            <Input
              type="number"
              min={0}
              value={form.priceAnnualSar}
              onChange={(e) => setForm({ ...form, priceAnnualSar: e.target.value })}
              dir="ltr"
            />
          </Field>
          <Field label={t('plans.modal.trialDays')}>
            <Input
              type="number"
              min={0}
              max={365}
              value={form.trialDays}
              onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
              dir="ltr"
            />
          </Field>
          <Field label={t('plans.modal.products')}>
            <div className="flex gap-4">
              {PRODUCT_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={form.products.includes(key)} onChange={() => toggleProduct(key)} />
                  {key}
                </label>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={form.isRecommended}
              onChange={(e) => setForm({ ...form, isRecommended: e.target.checked })}
            />
            {t('plans.modal.isRecommended')}
          </label>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? t('plans.modal.submitting') : t('plans.modal.submit')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
