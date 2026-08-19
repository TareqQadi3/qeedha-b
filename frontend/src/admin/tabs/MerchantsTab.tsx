import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Select } from '../../components/ui';
import { formatDate } from '../../utils/formatDate';
import { adminApi } from '../adminApi';
import { PlatformAdminRole } from '../AdminAuthContext';

interface Subscription {
  status: 'trialing' | 'active' | 'expired' | 'suspended' | 'cancelled';
  trialEndsAt: string | null;
  plan: { code: string; name: string; products: string[] } | null;
}

interface Company {
  id: string;
  legalName: string;
  tradeName: string | null;
  vatNumber: string | null;
  countryCode: string;
  status: 'active' | 'suspended';
  createdAt: string;
  subscription: Subscription | null;
}

interface Plan {
  code: string;
  name: string;
}

const emptyForm = {
  legalName: '',
  tradeName: '',
  vatNumber: '',
  ownerFullName: '',
  ownerEmail: '',
  password: '',
};

const SUB_STATUSES: Subscription['status'][] = ['trialing', 'active', 'expired', 'suspended', 'cancelled'];

/** Merchants section (Website phase spec "Control Center" "Merchants" + "Subscriptions"): the list is visible to every staff role (no PlatformAdminRoleGuard on GET /platform-admin/companies), but the mutating actions (create company, change subscription status/plan/trial) require 'admin' or 'finance' - matching PlatformAdminController's route guards exactly, so the UI never offers an action the backend would reject. */
export function MerchantsTab({ role }: { role: PlatformAdminRole }) {
  const { t } = useTranslation('admin');
  const canManageSubscription = role === 'admin' || role === 'finance';

  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
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

  const [managing, setManaging] = useState<Company | null>(null);
  const [statusChoice, setStatusChoice] = useState<Subscription['status']>('active');
  const [planChoice, setPlanChoice] = useState('');
  const [extendDays, setExtendDays] = useState(30);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageBusy, setManageBusy] = useState(false);

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
    if (canManageSubscription) {
      adminApi
        .get('/platform-admin/plans')
        .then((data: Plan[]) => setPlans(data))
        .catch(() => {});
    }
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

  const openManage = (company: Company) => {
    setManaging(company);
    setStatusChoice(company.subscription?.status ?? 'active');
    setPlanChoice(company.subscription?.plan?.code ?? '');
    setExtendDays(30);
    setManageError(null);
  };

  const onChangeStatus = async () => {
    if (!managing) return;
    setManageBusy(true);
    setManageError(null);
    try {
      await adminApi.post(`/platform-admin/companies/${managing.id}/subscription/status`, {
        status: statusChoice,
      });
      await load();
      setManaging(null);
    } catch {
      setManageError(t('errors.actionFailed'));
    } finally {
      setManageBusy(false);
    }
  };

  const onChangePlan = async () => {
    if (!managing || !planChoice) return;
    setManageBusy(true);
    setManageError(null);
    try {
      await adminApi.post(`/platform-admin/companies/${managing.id}/subscription/plan`, {
        planCode: planChoice,
      });
      await load();
      setManaging(null);
    } catch {
      setManageError(t('errors.actionFailed'));
    } finally {
      setManageBusy(false);
    }
  };

  const onExtendTrial = async () => {
    if (!managing) return;
    setManageBusy(true);
    setManageError(null);
    try {
      await adminApi.post(`/platform-admin/companies/${managing.id}/subscription/extend-trial`, {
        days: extendDays,
      });
      await load();
      setManaging(null);
    } catch {
      setManageError(t('errors.actionFailed'));
    } finally {
      setManageBusy(false);
    }
  };

  const subBadgeVariant = (status?: Subscription['status']) => {
    switch (status) {
      case 'active':
        return 'success' as const;
      case 'trialing':
        return 'brand' as const;
      case 'expired':
      case 'suspended':
      case 'cancelled':
        return 'danger' as const;
      default:
        return 'neutral' as const;
    }
  };

  return (
    <div>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        action={canManageSubscription && <Button onClick={openCreateModal}>{t('dashboard.addButton')}</Button>}
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
                  <th className="py-2">{t('dashboard.table.country')}</th>
                  <th className="py-2">{t('dashboard.table.status')}</th>
                  <th className="py-2">{t('dashboard.table.subscription')}</th>
                  <th className="py-2">{t('dashboard.table.product')}</th>
                  <th className="py-2">{t('dashboard.table.createdAt')}</th>
                  {canManageSubscription && <th className="py-2">{t('dashboard.table.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{c.legalName}</td>
                    <td className="py-2 text-slate-500" dir="ltr">
                      {c.countryCode}
                    </td>
                    <td className="py-2">
                      <Badge variant={c.status === 'active' ? 'success' : 'danger'}>
                        {c.status === 'active' ? t('dashboard.status.active') : t('dashboard.status.suspended')}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <Badge variant={subBadgeVariant(c.subscription?.status)}>
                        {c.subscription ? t(`dashboard.subStatus.${c.subscription.status}`) : t('dashboard.subStatus.none')}
                      </Badge>
                    </td>
                    <td className="py-2 text-slate-500">{c.subscription?.plan?.products.join(', ') ?? '—'}</td>
                    <td className="py-2 text-slate-500">{formatDate(new Date(c.createdAt))}</td>
                    {canManageSubscription && (
                      <td className="py-2">
                        <Button variant="secondary" onClick={() => openManage(c)}>
                          {t('dashboard.manage')}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
                {companies.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">
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

      <Modal
        open={!!managing}
        onClose={() => setManaging(null)}
        title={t('subscriptionModal.title', { name: managing?.legalName ?? '' })}
      >
        <div className="space-y-4">
          <ErrorBanner message={manageError} />
          <Field label={t('subscriptionModal.status')}>
            <div className="flex gap-2">
              <Select value={statusChoice} onChange={(e) => setStatusChoice(e.target.value as Subscription['status'])}>
                {SUB_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`dashboard.subStatus.${s}`)}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" disabled={manageBusy} onClick={onChangeStatus}>
                {t('subscriptionModal.changeStatus')}
              </Button>
            </div>
          </Field>
          <Field label={t('subscriptionModal.plan')}>
            <div className="flex gap-2">
              <Select value={planChoice} onChange={(e) => setPlanChoice(e.target.value)}>
                {plans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" disabled={manageBusy || !planChoice} onClick={onChangePlan}>
                {t('subscriptionModal.changePlan')}
              </Button>
            </div>
          </Field>
          <Field label={t('subscriptionModal.extendDays')}>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={365}
                value={extendDays}
                onChange={(e) => setExtendDays(Number(e.target.value))}
              />
              <Button variant="secondary" disabled={manageBusy} onClick={onExtendTrial}>
                {t('subscriptionModal.extendTrial')}
              </Button>
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
