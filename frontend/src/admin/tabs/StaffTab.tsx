import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Select } from '../../components/ui';
import { adminApi } from '../adminApi';
import { PlatformAdminRole } from '../AdminAuthContext';

interface Staff {
  id: string;
  fullName: string;
  email: string;
  role: PlatformAdminRole;
  status: 'active' | 'disabled';
}

const ROLES: PlatformAdminRole[] = ['admin', 'finance', 'support', 'marketing', 'developer'];

const emptyForm = { fullName: '', email: '', password: '', role: 'support' as PlatformAdminRole };

/** Staff / Admin Users (admin role only) - Website phase spec "do not give every employee full admin access": every account created here gets exactly one of the 5 roles PlatformAdminRoleGuard enforces on the backend. */
export function StaffTab() {
  const { t } = useTranslation('admin');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setStaff(await adminApi.get('/platform-admin/staff'));
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
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await adminApi.post('/platform-admin/staff', form);
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
      <PageHeader title={t('staff.title')} subtitle={t('staff.subtitle')} action={<Button onClick={openCreate}>{t('staff.addButton')}</Button>} />
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">{t('dashboard.loading')}</div>}
      {!loading && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('staff.table.fullName')}</th>
                  <th className="py-2">{t('staff.table.email')}</th>
                  <th className="py-2">{t('staff.table.role')}</th>
                  <th className="py-2">{t('staff.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{s.fullName}</td>
                    <td className="py-2 text-slate-500" dir="ltr">
                      {s.email}
                    </td>
                    <td className="py-2">
                      <Badge variant="brand">{t(`staff.roles.${s.role}`)}</Badge>
                    </td>
                    <td className="py-2">
                      <Badge variant={s.status === 'active' ? 'success' : 'danger'}>{s.status}</Badge>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      {t('staff.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('staff.modal.title')}>
        <form onSubmit={onSubmit} className="space-y-3">
          <ErrorBanner message={formError} />
          <Field label={t('staff.modal.fullName')}>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required autoFocus />
          </Field>
          <Field label={t('staff.modal.email')}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required dir="ltr" />
          </Field>
          <Field label={t('staff.modal.password')}>
            <Input
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              dir="ltr"
            />
          </Field>
          <Field label={t('staff.modal.role')}>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as PlatformAdminRole })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`staff.roles.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? t('staff.modal.submitting') : t('staff.modal.submit')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
