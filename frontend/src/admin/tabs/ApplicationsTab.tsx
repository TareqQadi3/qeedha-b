import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Card, ErrorBanner, PageHeader, Select } from '../../components/ui';
import { formatDate } from '../../utils/formatDate';
import { adminApi } from '../adminApi';

type ApplicationStatus = 'new' | 'reviewed' | 'accepted' | 'rejected';

interface JoinApplication {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: ApplicationStatus;
  createdAt: string;
}

const STATUSES: ApplicationStatus[] = ['new', 'reviewed', 'accepted', 'rejected'];

const badgeVariant = (status: ApplicationStatus) =>
  ({ new: 'brand', reviewed: 'neutral', accepted: 'success', rejected: 'danger' })[status] as
    | 'brand'
    | 'neutral'
    | 'success'
    | 'danger';

/** Join Us / careers applications (marketing or support role) - Website phase spec "Join Us / Partners". */
export function ApplicationsTab() {
  const { t } = useTranslation('admin');
  const [applications, setApplications] = useState<JoinApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = () => {
    adminApi
      .get('/platform-admin/applications')
      .then(setApplications)
      .catch(() => setError(t('errors.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(load, [t]);

  const onStatusChange = async (id: string, status: ApplicationStatus) => {
    setUpdatingId(id);
    try {
      await adminApi.patch(`/platform-admin/applications/${id}`, { status });
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    } catch {
      setError(t('errors.actionFailed'));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <PageHeader title={t('applications.title')} subtitle={t('applications.subtitle')} />
      <ErrorBanner message={error} />
      {loading && <div className="py-6 text-center text-slate-400">{t('dashboard.loading')}</div>}
      {!loading && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('applications.table.fullName')}</th>
                  <th className="py-2">{t('applications.table.email')}</th>
                  <th className="py-2">{t('applications.table.role')}</th>
                  <th className="py-2">{t('applications.table.createdAt')}</th>
                  <th className="py-2">{t('applications.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{a.fullName}</td>
                    <td className="py-2 text-slate-500" dir="ltr">
                      {a.email}
                    </td>
                    <td className="py-2 text-slate-500">{a.role}</td>
                    <td className="py-2 text-slate-500">{formatDate(new Date(a.createdAt))}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={badgeVariant(a.status)}>{t(`applications.status.${a.status}`)}</Badge>
                        <Select
                          className="w-auto"
                          value={a.status}
                          disabled={updatingId === a.id}
                          onChange={(e) => onStatusChange(a.id, e.target.value as ApplicationStatus)}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {t(`applications.status.${s}`)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </td>
                  </tr>
                ))}
                {applications.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      {t('applications.empty')}
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
