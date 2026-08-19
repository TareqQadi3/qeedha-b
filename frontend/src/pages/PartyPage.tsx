import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Pagination } from '../components/ui';
import { useAuth } from '../state/auth';

interface Party {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  reference: string | null;
  isActive: boolean;
  contactPerson?: string | null;
}

const emptyForm = { name: '', phone: '', email: '', reference: '', contactPerson: '' };

/** Shared list+create UI for Customers and Suppliers - same shape, different endpoint/permissions. */
export function PartyPage({
  title,
  endpoint,
  permissionPrefix,
  addButtonLabel,
  showContactPerson,
}: {
  title: string;
  endpoint: string;
  permissionPrefix: 'customers' | 'suppliers';
  addButtonLabel: string;
  showContactPerson?: boolean;
}) {
  const { t } = useTranslation('party');
  const { hasPermission } = useAuth();
  const [data, setData] = useState<Party[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const load = async (page = meta.page) => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await api.get(endpoint, { page, pageSize: meta.pageSize, search: search || undefined });
      setData(res.data);
      setMeta(res.meta);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : t('shared.loadFailed'));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    load(1);
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post(endpoint, {
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        reference: form.reference || undefined,
        contactPerson: showContactPerson ? form.contactPerson || undefined : undefined,
      });
      setModalOpen(false);
      setForm(emptyForm);
      await load(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('shared.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={title}
        action={
          hasPermission(`${permissionPrefix}.create`) && (
            <Button onClick={() => setModalOpen(true)}>{addButtonLabel}</Button>
          )
        }
      />

      <form onSubmit={onSearchSubmit} className="mb-4 flex gap-2">
        <Input placeholder={t('shared.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button type="submit" variant="secondary">{t('shared.searchButton')}</Button>
      </form>

      <ErrorBanner message={listError} />
      {listLoading && <div className="py-6 text-center text-slate-400">{t('shared.loading')}</div>}
      {!listLoading && (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">{t('shared.table.name')}</th>
                <th className="py-2">{t('shared.table.phone')}</th>
                <th className="py-2">{t('shared.table.email')}</th>
                <th className="py-2">{t('shared.table.reference')}</th>
                <th className="py-2">{t('shared.table.status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2">{p.name}</td>
                  <td className="py-2">{p.phone ?? '—'}</td>
                  <td className="py-2">{p.email ?? '—'}</td>
                  <td className="py-2">{p.reference ?? '—'}</td>
                  <td className="py-2">
                    <span className={p.isActive ? 'text-emerald-600' : 'text-slate-400'}>
                      {p.isActive ? t('shared.status.active') : t('shared.status.inactive')}
                    </span>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    {t('shared.table.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onChange={load} />
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={addButtonLabel}>
        <form onSubmit={onCreate} className="space-y-3">
          <ErrorBanner message={error} />
          <Field label={t('shared.fields.name')}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          {showContactPerson && (
            <Field label={t('shared.fields.contactPerson')}>
              <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('shared.fields.phone')}>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label={t('shared.fields.email')}>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <Field label={t('shared.fields.referenceOptional')}>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('shared.actions.saving') : t('shared.actions.save')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
