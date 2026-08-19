import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Badge, Card, ErrorBanner, PageHeader } from '../components/ui';

const money = (n: number | string | null) => (n === null ? null : Number(n).toFixed(2));

const STATUS_CLASSNAMES: Record<string, string> = {
  trialing: 'bg-blue-50 text-blue-700',
  active: 'bg-green-50 text-green-700',
  expired: 'bg-amber-50 text-amber-700',
  suspended: 'bg-red-50 text-red-700',
  cancelled: 'bg-red-50 text-red-700',
};

interface UsageEntry {
  current: number;
  limit: number | null;
}

interface SubscriptionMe {
  status: string;
  effectiveStatus: string;
  isRestricted: boolean;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  plan: {
    code: string;
    name: string;
    description: string | null;
    priceMonthlySar: string | number | null;
    billingInterval: string;
  };
  features: Record<string, boolean>;
  usage: {
    users: UsageEntry;
    branches: UsageEntry;
    monthlySales: UsageEntry;
  };
  billingNote: string;
}

interface PlanCatalogEntry {
  code: string;
  name: string;
  description: string | null;
  priceMonthlySar: string | number | null;
  billingInterval: string;
  maxUsers: number | null;
  maxBranches: number | null;
  maxMonthlySales: number | null;
  features: Record<string, boolean>;
}

function UsageRow({ label, usage }: { label: string; usage: UsageEntry }) {
  const { t } = useTranslation('subscription');
  const pct = usage.limit ? Math.min(100, Math.round((usage.current / usage.limit) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-800">
          {usage.current} / {usage.limit === null ? t('usage.unlimited') : usage.limit}
        </span>
      </div>
      {usage.limit !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function SubscriptionPage() {
  const { t } = useTranslation('subscription');
  const [data, setData] = useState<SubscriptionMe | null>(null);
  const [plans, setPlans] = useState<PlanCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const FEATURE_LABELS: Record<string, string> = {
    pos: t('features.pos'),
    inventory: t('features.inventory'),
    accounting: t('features.accounting'),
    reports: t('features.reports'),
    excel_import: t('features.excelImport'),
    zatca: t('features.zatca'),
    ar_ap: t('features.arAp'),
  };

  const STATUS_LABELS: Record<string, { label: string; className: string }> = {
    trialing: { label: t('status.trialing'), className: STATUS_CLASSNAMES.trialing },
    active: { label: t('status.active'), className: STATUS_CLASSNAMES.active },
    expired: { label: t('status.expired'), className: STATUS_CLASSNAMES.expired },
    suspended: { label: t('status.suspended'), className: STATUS_CLASSNAMES.suspended },
    cancelled: { label: t('status.cancelled'), className: STATUS_CLASSNAMES.cancelled },
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.get('/subscriptions/me'), api.get('/subscriptions/plans')])
      .then(([me, planList]) => {
        setData(me);
        setPlans(planList);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('errors.loadFailed')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="py-6 text-center text-slate-400">{t('loading')}</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <ErrorBanner message={error ?? t('errors.loadFailed')} />
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[data.status] ?? { label: data.status, className: 'bg-slate-100 text-slate-700' };
  const priceLabel =
    data.plan.priceMonthlySar === null
      ? t('labels.contactSupport')
      : t('labels.priceMonthly', { price: money(data.plan.priceMonthlySar) });

  return (
    <div className="space-y-4">
      <PageHeader title={t('title')} />

      {data.isRestricted && <ErrorBanner message={t('banners.restricted')} />}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">{t('labels.currentPlan')}</div>
            <div className="text-lg font-bold text-slate-800">{data.plan.name}</div>
            {data.plan.description && <div className="mt-1 text-sm text-slate-500">{data.plan.description}</div>}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        </div>

        <div className="mt-3 text-sm text-slate-600">
          {t('labels.priceLabel')} <span className="font-medium text-slate-800">{priceLabel}</span>
          <span className="ms-1 text-xs text-slate-400">{t('labels.priceEstimateNote')}</span>
        </div>

        {data.status === 'trialing' && data.trialDaysRemaining !== null && (
          <div className="mt-2 text-sm text-blue-700">
            {t('trial.daysRemaining', { count: data.trialDaysRemaining })}
          </div>
        )}

        <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">{data.billingNote}</div>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700">{t('features.title')}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Object.entries(FEATURE_LABELS).map(([key, label]) => {
            const enabled = data.features[key] === true;
            return (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className={enabled ? 'text-green-600' : 'text-slate-300'}>{enabled ? '✓' : '✕'}</span>
                <span className={enabled ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700">{t('usage.title')}</div>
        <div className="space-y-3">
          <UsageRow label={t('usage.users')} usage={data.usage.users} />
          <UsageRow label={t('usage.branches')} usage={data.usage.branches} />
          <UsageRow label={t('usage.monthlySales')} usage={data.usage.monthlySales} />
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700">{t('plans.title')}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {plans.map((plan) => (
            <div
              key={plan.code}
              className={`rounded-xl border p-3 transition-colors ${plan.code === data.plan.code ? 'border-brand-500 bg-brand-50/40' : 'border-slate-200'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">{plan.name}</span>
                {plan.code === data.plan.code && <Badge variant="brand">{t('labels.currentPlan')}</Badge>}
              </div>
              {plan.description && <div className="mt-1 text-xs text-slate-500">{plan.description}</div>}
              <div className="mt-2 text-sm text-slate-700">
                {plan.priceMonthlySar === null
                  ? t('labels.contactSupport')
                  : t('labels.priceMonthly', { price: money(plan.priceMonthlySar) })}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {t('plans.summary', {
                  users: plan.maxUsers ?? t('usage.unlimited'),
                  branches: plan.maxBranches ?? t('usage.unlimited'),
                  sales: plan.maxMonthlySales ?? t('usage.unlimited'),
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {t('plans.footerNote')}
        </div>
      </Card>
    </div>
  );
}
