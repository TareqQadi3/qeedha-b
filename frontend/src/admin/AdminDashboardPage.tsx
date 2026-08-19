import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, PageHeader } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { formatDate } from '../utils/formatDate';
import { adminApi } from './adminApi';
import { useAdminAuth } from './AdminAuthContext';

interface Company {
  id: string;
  legalName: string;
  tradeName: string | null;
  vatNumber: string | null;
  status: 'active' | 'suspended';
  createdAt: string;
}

const emptyForm = {
  legalName: '',
  tradeName: '',
  vatNumber: '',
  ownerFullName: '',
  ownerEmail: '',
  password: '',
};

/** SaaS control panel dashboard (docs/DOMAIN_MODEL.md "Platform admin") - lists every merchant company and lets an admin create new ones on a merchant's behalf. */
export function AdminDashboardPage() {
  const { t } = useTranslation('admin');
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [createdCredentials, setCreatedCredentials] = useState<{
    legalName: string;
    email: string;
    password: string;
  } | null>(null);

  const load = async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await adminApi.get('/platform-admin/companies');
      setCompanies(data);
    } catch {
      setListError(t('dashboard.loadError'));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateModal = () => {
    setForm(emptyForm);
    setCreateError(null);
    setCreateModalOpen(true);
  };

  const onCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await adminApi.post('/platform-admin/companies', {
        legalName: form.legalName,
        tradeName: form.tradeName || undefined,
        vatNumber: form.vatNumber || undefined,
        ownerFullName: form.ownerFullName,
        ownerEmail: form.ownerEmail,
        password: form.password,
      });
      setCreateModalOpen(false);
      setCreatedCredentials({ legalName: form.legalName, email: form.ownerEmail, password: form.password });
      await load();
    } catch {
      setCreateError(t('errors.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const onLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-base font-extrabold text-white">
            ق
          </div>
          <div>
            <div className="text-base font-bold leading-tight text-slate-900">{t('appName')}</div>
            <div className="text-xs text-slate-500">{admin?.fullName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="secondary" onClick={onLogout}>
            {t('dashboard.logout')}
          </Button>
        </div>
      </div>

      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        action={<Button onClick={openCreateModal}>{t('dashboard.addButton')}</Button>}
      />

      <ErrorBanner message={listError} />
      {listLoading && <div className="py-6 text-center text-slate-400">{t('dashboard.loading')}</div>}

      {!listLoading && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('dashboard.table.legalName')}</th>
                  <th className="py-2">{t('dashboard.table.tradeName')}</th>
                  <th className="py-2">{t('dashboard.table.vatNumber')}</th>
                  <th className="py-2">{t('dashboard.table.status')}</th>
                  <th className="py-2">{t('dashboard.table.createdAt')}</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{c.legalName}</td>
                    <td className="py-2 text-slate-500">{c.tradeName ?? '—'}</td>
                    <td className="py-2 text-slate-500">{c.vatNumber ?? '—'}</td>
                    <td className="py-2">
                      <Badge variant={c.status === 'active' ? 'success' : 'danger'}>
                        {c.status === 'active' ? t('dashboard.status.active') : t('dashboard.status.suspended')}
                      </Badge>
                    </td>
                    <td className="py-2 text-slate-500">{formatDate(new Date(c.createdAt))}</td>
                  </tr>
                ))}
                {companies.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      {t('dashboard.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title={t('createModal.title')}>
        <form onSubmit={onCreateSubmit} className="space-y-3">
          <ErrorBanner message={createError} />
          <Field label={t('createModal.legalName')}>
            <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} required autoFocus />
          </Field>
          <Field label={t('createModal.tradeName')}>
            <Input value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} />
          </Field>
          <Field label={t('createModal.vatNumber')}>
            <Input value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} dir="ltr" />
          </Field>
          <Field label={t('createModal.ownerFullName')}>
            <Input value={form.ownerFullName} onChange={(e) => setForm({ ...form, ownerFullName: e.target.value })} required />
          </Field>
          <Field label={t('createModal.ownerEmail')}>
            <Input
              type="email"
              value={form.ownerEmail}
              onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
              required
              dir="ltr"
            />
          </Field>
          <Field label={t('createModal.password')}>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required
              dir="ltr"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('createModal.passwordHint')}</span>
          </Field>
          <Button type="submit" className="w-full" disabled={creating}>
            {creating ? t('createModal.submitting') : t('createModal.submit')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!createdCredentials}
        onClose={() => setCreatedCredentials(null)}
        title={t('createSuccess.title')}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{t('createSuccess.instructions')}</p>
          <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="font-medium text-slate-900">{createdCredentials?.legalName}</div>
            <div className="font-mono text-slate-700" dir="ltr">
              {createdCredentials?.email}
            </div>
            <div className="font-mono text-slate-700" dir="ltr">
              {createdCredentials?.password}
            </div>
          </div>
          <Button className="w-full" onClick={() => setCreatedCredentials(null)}>
            {t('createSuccess.close')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
