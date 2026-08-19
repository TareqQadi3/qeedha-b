import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Card, ErrorBanner, PageHeader } from '../../components/ui';
import { adminApi } from '../adminApi';

interface Affiliate {
  id: string;
  fullName: string;
  email: string;
  code: string;
  commissionPercent: string;
  status: 'active' | 'disabled';
  referralsCount: number;
  totalCommissionSar: number;
  pendingCommissionSar: number;
}

/** Affiliates (finance or marketing role) - Website phase spec "Affiliate system": commissions here are computed electronically by the backend from real subscription activations (AffiliatesService), never entered manually. */
export function AffiliatesTab() {
  const { t } = useTranslation('admin');
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .get('/platform-admin/affiliates')
      .then(setAffiliates)
      .catch(() => setError(t('errors.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <div>
      <PageHeader title={t('affiliates.title')} subtitle={t('affiliates.subtitle')} />
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">{t('dashboard.loading')}</div>}
      {!loading && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('affiliates.table.fullName')}</th>
                  <th className="py-2">{t('affiliates.table.email')}</th>
                  <th className="py-2">{t('affiliates.table.code')}</th>
                  <th className="py-2">{t('affiliates.table.commissionPercent')}</th>
                  <th className="py-2">{t('affiliates.table.referralsCount')}</th>
                  <th className="py-2">{t('affiliates.table.totalCommission')}</th>
                  <th className="py-2">{t('affiliates.table.pendingCommission')}</th>
                  <th className="py-2">{t('affiliates.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {affiliates.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{a.fullName}</td>
                    <td className="py-2 text-slate-500" dir="ltr">
                      {a.email}
                    </td>
                    <td className="py-2 font-mono text-xs" dir="ltr">
                      {a.code}
                    </td>
                    <td className="py-2 text-slate-500">{a.commissionPercent}%</td>
                    <td className="py-2 tabular-nums">{a.referralsCount}</td>
                    <td className="py-2 tabular-nums">{a.totalCommissionSar.toFixed(2)}</td>
                    <td className="py-2 tabular-nums">{a.pendingCommissionSar.toFixed(2)}</td>
                    <td className="py-2">
                      <Badge variant={a.status === 'active' ? 'success' : 'danger'}>{a.status}</Badge>
                    </td>
                  </tr>
                ))}
                {affiliates.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400">
                      {t('affiliates.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
