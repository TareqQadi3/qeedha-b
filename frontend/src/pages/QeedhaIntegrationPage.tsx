import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, PageHeader } from '../components/ui';
import { useAuth } from '../state/auth';
import { formatDateTime } from '../utils/formatDate';

interface ConnectionStatus {
  status: 'not_connected' | 'connected' | 'disabled' | string;
  publicReference: string | null;
  secretLastFour: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  revokedAt: string | null;
}

interface LinkResult extends ConnectionStatus {
  secret: string;
}

const STATUS_CLASSNAMES: Record<string, string> = {
  connected: 'bg-green-50 text-green-700',
  disabled: 'bg-red-50 text-red-700',
  not_connected: 'bg-slate-100 text-slate-600',
};

const formatDate = (value: string | null) => (value ? formatDateTime(new Date(value)) : '—');

export function QeedhaIntegrationPage() {
  const { t } = useTranslation('integration');
  const { hasPermission } = useAuth();
  const STATUS_LABELS: Record<string, { label: string; className: string }> = {
    connected: { label: t('status.connected'), className: STATUS_CLASSNAMES.connected },
    disabled: { label: t('status.disabled'), className: STATUS_CLASSNAMES.disabled },
    not_connected: { label: t('status.notConnected'), className: STATUS_CLASSNAMES.not_connected },
  };
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [justLinked, setJustLinked] = useState<LinkResult | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  const canRead = hasPermission('integration.read');
  const canManage = hasPermission('integration.manage');

  const load = () => {
    setLoading(true);
    setLoadError(null);
    api
      .get('/qeedha-integration/connection')
      .then((data) => setStatus(data))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : t('errors.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (canRead) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const link = async () => {
    setActionBusy(true);
    setActionError(null);
    setJustLinked(null);
    try {
      const result: LinkResult = await api.post('/qeedha-integration/connection');
      setJustLinked(result);
      setStatus(result);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('errors.linkFailed'));
    } finally {
      setActionBusy(false);
    }
  };

  const revoke = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      const result: ConnectionStatus = await api.delete('/qeedha-integration/connection');
      setStatus(result);
      setJustLinked(null);
      setConfirmingRevoke(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('errors.revokeFailed'));
    } finally {
      setActionBusy(false);
    }
  };

  if (!canRead) {
    return <ErrorBanner message={t('errors.noViewPermission')} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('title')} />

      <ErrorBanner message={actionError} />
      {loading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
      {!loading && loadError && <ErrorBanner message={loadError} />}

      {!loading && !loadError && status && (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">{t('labels.connectionStatus')}</div>
                <div className="mt-1 text-lg font-bold text-slate-800">{t('labels.providerName')}</div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  (STATUS_LABELS[status.status] ?? STATUS_LABELS.not_connected).className
                }`}
              >
                {(STATUS_LABELS[status.status] ?? STATUS_LABELS.not_connected).label}
              </span>
            </div>

            {status.publicReference && (
              <div className="mt-4 space-y-1 text-sm text-slate-600">
                <div>
                  {t('labels.publicReference')}{' '}
                  <span className="font-mono font-medium text-slate-800">{status.publicReference}</span>
                </div>
                {status.secretLastFour && (
                  <div>
                    {t('labels.secretLastFour')}{' '}
                    <span className="font-mono font-medium text-slate-800">••••{status.secretLastFour}</span>
                  </div>
                )}
                <div>{t('labels.connectedAt')} {formatDate(status.connectedAt)}</div>
                <div>{t('labels.lastVerifiedAt')} {formatDate(status.lastVerifiedAt)}</div>
                {status.revokedAt && <div>{t('labels.revokedAt')} {formatDate(status.revokedAt)}</div>}
              </div>
            )}

            {status.status === 'not_connected' && (
              <div className="mt-3 text-sm text-slate-500">
                {t('labels.notConnectedHint')}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {canManage && status.status !== 'connected' && (
                <Button onClick={link} disabled={actionBusy}>
                  {status.status === 'disabled' ? t('actions.relink') : t('actions.link')}
                </Button>
              )}
              {canManage && status.status === 'connected' && !confirmingRevoke && (
                <Button variant="danger" onClick={() => setConfirmingRevoke(true)} disabled={actionBusy}>
                  {t('actions.revoke')}
                </Button>
              )}
              {canManage && status.status === 'connected' && confirmingRevoke && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">
                    {t('confirm.revokeMessage')}
                  </span>
                  <Button variant="danger" onClick={revoke} disabled={actionBusy}>
                    {t('actions.confirmRevoke')}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmingRevoke(false)} disabled={actionBusy}>
                    {t('actions.cancel')}
                  </Button>
                </div>
              )}
              {!canManage && (
                <div className="text-xs text-slate-400">{t('errors.noManagePermission')}</div>
              )}
            </div>
          </Card>

          {justLinked && (
            <Card className="border-amber-300 bg-amber-50/40">
              <div className="mb-2 text-sm font-semibold text-amber-800">
                {t('labels.secretOnceHeader')}
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-xs text-slate-500">{t('labels.externalMerchantId')}</div>
                  <div className="mt-1 select-all break-all rounded-md bg-white px-3 py-2 font-mono text-sm">
                    {justLinked.publicReference}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{t('labels.secretLabel')}</div>
                  <div className="mt-1 select-all break-all rounded-md bg-white px-3 py-2 font-mono text-sm">
                    {justLinked.secret}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  {t('labels.fullAccessToken')}{' '}
                  <span className="font-mono">{`${justLinked.publicReference}.${justLinked.secret}`}</span>
                </div>
              </div>
              <div className="mt-3 rounded-md bg-white px-3 py-2 text-xs text-slate-500">
                {t('labels.saveKeyNote')}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
