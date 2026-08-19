import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBanner, PageHeader } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { formatDate } from '../utils/formatDate';
import { affiliateApi } from './affiliateApi';
import { useAffiliateAuth } from './AffiliateAuthContext';

interface DashboardData {
  affiliate: { fullName: string; email: string; code: string; commissionPercent: string };
  summary: {
    totalReferrals: number;
    trials: number;
    conversions: number;
    expiredOrCancelled: number;
    totalCommissionSar: number;
    pendingCommissionSar: number;
  };
  referrals: {
    id: string;
    referredAt: string;
    subscriptionStatus: string | null;
    commission: { amountSar: number; status: string } | null;
  }[];
}

const statusBadgeVariant = (status: string | null) => {
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

/** Phase 9 "Affiliate Dashboard" - self-service view for the affiliate's own referrals/commissions only (GET /affiliates/dashboard, scoped to the authenticated affiliate). */
export function AffiliateDashboardPage() {
  const { t } = useTranslation('site');
  const { affiliate, logout } = useAffiliateAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    affiliateApi
      .get('/affiliates/dashboard')
      .then(setData)
      .catch(() => setError(t('affiliate.error')));
  }, [t]);

  const onLogout = () => {
    logout();
    navigate('/affiliate/login');
  };

  if (!affiliate) return null;

  const referralUrl = `${window.location.origin}/register?ref=${affiliate.code}`;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-base font-bold text-slate-900">{affiliate.fullName}</div>
          <div className="font-mono text-xs text-slate-500" dir="ltr">
            {referralUrl}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="secondary" onClick={onLogout}>
            {t('affiliate.logout')}
          </Button>
        </div>
      </div>

      <PageHeader title={t('affiliate.dashboardTitle')} />
      <ErrorBanner message={error} />

      {!data && !error && <div className="py-6 text-center text-slate-400">…</div>}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                ['totalReferrals', data.summary.totalReferrals],
                ['trials', data.summary.trials],
                ['conversions', data.summary.conversions],
                ['totalCommission', data.summary.totalCommissionSar.toFixed(2)],
                ['pendingCommission', data.summary.pendingCommissionSar.toFixed(2)],
              ] as const
            ).map(([key, value]) => (
              <Card key={key} className="p-4">
                <div className="text-2xl font-extrabold tabular-nums text-slate-900">{value}</div>
                <div className="mt-1 text-xs text-slate-500">{t(`affiliate.summary.${key}`)}</div>
              </Card>
            ))}
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2">{t('affiliate.table.referredAt')}</th>
                    <th className="py-2">{t('affiliate.table.status')}</th>
                    <th className="py-2">{t('affiliate.table.commission')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referrals.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 text-slate-500">{formatDate(new Date(r.referredAt))}</td>
                      <td className="py-2">
                        <Badge variant={statusBadgeVariant(r.subscriptionStatus)}>
                          {r.subscriptionStatus ? t(`affiliate.status.${r.subscriptionStatus}`) : t('affiliate.status.none')}
                        </Badge>
                      </td>
                      <td className="py-2 tabular-nums">
                        {r.commission ? `${r.commission.amountSar.toFixed(2)} (${t(`affiliate.commissionStatus.${r.commission.status}`)})` : '—'}
                      </td>
                    </tr>
                  ))}
                  {data.referrals.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-slate-400">
                        {t('affiliate.noReferrals')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
