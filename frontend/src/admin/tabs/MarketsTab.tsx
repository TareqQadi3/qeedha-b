import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, PageHeader } from '../../components/ui';
import { adminApi } from '../adminApi';

interface Market {
  code: string;
  nameAr: string;
  nameEn: string;
  currency: string;
  isActive: boolean;
}

const emptyForm = { code: '', nameAr: '', nameEn: '', currency: '' };

/** Markets (admin role only) - Website phase spec "Language and country": the initial Saudi Arabia market is seeded once by migration, every other market is added here, never hardcoded again. */
export function MarketsTab() {
  const { t } = useTranslation('admin');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setMarkets(await adminApi.get('/platform-admin/markets'));
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
    setEditingCode(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (market: Market) => {
    setEditingCode(market.code);
    setForm({ code: market.code, nameAr: market.nameAr, nameEn: market.nameEn, currency: market.currency });
    setFormError(null);
    setModalOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (editingCode) {
        await adminApi.patch(`/platform-admin/markets/${editingCode}`, {
          nameAr: form.nameAr,
          nameEn: form.nameEn,
          currency: form.currency.toUpperCase(),
        });
      } else {
        await adminApi.post('/platform-admin/markets', {
          code: form.code.toUpperCase(),
          nameAr: form.nameAr,
          nameEn: form.nameEn,
          currency: form.currency.toUpperCase(),
        });
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
      <PageHeader title={t('markets.title')} subtitle={t('markets.subtitle')} action={<Button onClick={openCreate}>{t('markets.addButton')}</Button>} />
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">{t('dashboard.loading')}</div>}
      {!loading && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('markets.table.code')}</th>
                  <th className="py-2">{t('markets.table.nameAr')}</th>
                  <th className="py-2">{t('markets.table.nameEn')}</th>
                  <th className="py-2">{t('markets.table.currency')}</th>
                  <th className="py-2">{t('markets.table.active')}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => (
                  <tr key={m.code} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs" dir="ltr">
                      {m.code}
                    </td>
                    <td className="py-2 font-medium">{m.nameAr}</td>
                    <td className="py-2">{m.nameEn}</td>
                    <td className="py-2 text-slate-500" dir="ltr">
                      {m.currency}
                    </td>
                    <td className="py-2">
                      <Badge variant={m.isActive ? 'success' : 'danger'}>{m.isActive ? '✓' : '✕'}</Badge>
                    </td>
                    <td className="py-2">
                      <Button variant="secondary" onClick={() => openEdit(m)}>
                        {t('markets.modal.editTitle')}
                      </Button>
                    </td>
                  </tr>
                ))}
                {markets.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      {t('markets.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingCode ? t('markets.modal.editTitle') : t('markets.modal.createTitle')}>
        <form onSubmit={onSubmit} className="space-y-3">
          <ErrorBanner message={formError} />
          <Field label={t('markets.modal.code')}>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
              disabled={!!editingCode}
              maxLength={2}
              dir="ltr"
            />
          </Field>
          <Field label={t('markets.modal.nameAr')}>
            <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
          </Field>
          <Field label={t('markets.modal.nameEn')}>
            <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} required dir="ltr" />
          </Field>
          <Field label={t('markets.modal.currency')}>
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} required maxLength={3} dir="ltr" />
          </Field>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? t('markets.modal.submitting') : t('markets.modal.submit')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
