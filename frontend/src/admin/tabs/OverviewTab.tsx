import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, ErrorBanner } from '../../components/ui';
import { adminApi } from '../adminApi';

interface Overview {
  totalMerchants: number;
  activeMerchants: number;
  trialSubscriptions: number;
  expiredTrials: number;
  activeSubscriptions: number;
  suspendedSubscriptions: number;
  cancelledSubscriptions: number;
  qeedhaBSubscribers: number;
  qeedhaSubscribers: number;
  combinedSubscribers: number;
  totalAffiliates: number;
  totalCommissionSar: number;
  pendingCommissionSar: number;
  totalApplications: number;
  newApplications: number;
}

const METRIC_KEYS: (keyof Overview)[] = [
  'totalMerchants',
  'activeMerchants',
  'trialSubscriptions',
  'expiredTrials',
  'activeSubscriptions',
  'suspendedSubscriptions',
  'cancelledSubscriptions',
  'qeedhaBSubscribers',
  'qeedhaSubscribers',
  'combinedSubscribers',
  'totalAffiliates',
  'totalCommissionSar',
  'pendingCommissionSar',
  'totalApplications',
  'newApplications',
];

/** Website phase spec "Control Center" "Overview". Deliberately no per-tenant business data (customers/transactions) - see backend PlatformAdminService.getOverview doc comment / docs/WEBSITE.md "Known gaps". */
export function OverviewTab() {
  const { t } = useTranslation('admin');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .get('/platform-admin/overview')
      .then(setData)
      .catch(() => setError(t('errors.loadFailed')));
  }, [t]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <div className="py-6 text-center text-slate-400">{t('dashboard.loading')}</div>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {METRIC_KEYS.map((key) => (
        <Card key={key} className="p-4">
          <div className="text-2xl font-extrabold tabular-nums text-slate-900">{data[key]}</div>
          <div className="mt-1 text-xs text-slate-500">{t(`overview.${key}`)}</div>
        </Card>
      ))}
    </div>
  );
}
