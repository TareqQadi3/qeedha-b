import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, PageHeader } from '../components/ui';
import { useAuth } from '../state/auth';

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

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  connected: { label: 'متصل', className: 'bg-green-50 text-green-700' },
  disabled: { label: 'موقوف', className: 'bg-red-50 text-red-700' },
  not_connected: { label: 'غير مرتبط', className: 'bg-slate-100 text-slate-600' },
};

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString('ar-SA') : '—');

export function QeedhaIntegrationPage() {
  const { hasPermission } = useAuth();
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
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'تعذّر تحميل حالة تكامل قيّدها'))
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
      setActionError(err instanceof ApiError ? err.message : 'تعذّر ربط تكامل قيّدها');
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
      setActionError(err instanceof ApiError ? err.message : 'تعذّر قطع اتصال تكامل قيّدها');
    } finally {
      setActionBusy(false);
    }
  };

  if (!canRead) {
    return <ErrorBanner message="لا تملك صلاحية عرض تكامل قيّدها" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title="تكامل قيّدها" />

      <ErrorBanner message={actionError} />
      {loading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
      {!loading && loadError && <ErrorBanner message={loadError} />}

      {!loading && !loadError && status && (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">حالة الربط</div>
                <div className="mt-1 text-lg font-bold text-slate-800">مزوّد قيّدها</div>
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
                  المرجع العام (معرّف التاجر الخارجي):{' '}
                  <span className="font-mono font-medium text-slate-800">{status.publicReference}</span>
                </div>
                {status.secretLastFour && (
                  <div>
                    آخر 4 خانات من المفتاح السري:{' '}
                    <span className="font-mono font-medium text-slate-800">••••{status.secretLastFour}</span>
                  </div>
                )}
                <div>تاريخ الربط: {formatDate(status.connectedAt)}</div>
                <div>آخر تحقق: {formatDate(status.lastVerifiedAt)}</div>
                {status.revokedAt && <div>تاريخ الإيقاف: {formatDate(status.revokedAt)}</div>}
              </div>
            )}

            {status.status === 'not_connected' && (
              <div className="mt-3 text-sm text-slate-500">
                لم يتم ربط هذه المنشأة بمنصة قيّدها بعد. يتيح الربط لمنصة قيّدها إرسال معاملات تسوية دفعات إلى هذا
                النظام مباشرة.
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {canManage && status.status !== 'connected' && (
                <Button onClick={link} disabled={actionBusy}>
                  {status.status === 'disabled' ? 'إعادة ربط التكامل' : 'ربط التكامل'}
                </Button>
              )}
              {canManage && status.status === 'connected' && !confirmingRevoke && (
                <Button variant="danger" onClick={() => setConfirmingRevoke(true)} disabled={actionBusy}>
                  قطع الاتصال
                </Button>
              )}
              {canManage && status.status === 'connected' && confirmingRevoke && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">
                    تأكيد قطع اتصال تكامل قيّدها؟ سيتوقف المفتاح الحالي عن العمل فورًا.
                  </span>
                  <Button variant="danger" onClick={revoke} disabled={actionBusy}>
                    تأكيد القطع
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmingRevoke(false)} disabled={actionBusy}>
                    إلغاء
                  </Button>
                </div>
              )}
              {!canManage && (
                <div className="text-xs text-slate-400">لا تملك صلاحية إدارة تكامل قيّدها (ربط/قطع اتصال)</div>
              )}
            </div>
          </Card>

          {justLinked && (
            <Card className="border-amber-300 bg-amber-50/40">
              <div className="mb-2 text-sm font-semibold text-amber-800">
                المفتاح السري - يُعرض مرة واحدة فقط الآن ولن يكون بالإمكان استرجاعه لاحقًا
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-xs text-slate-500">معرّف التاجر الخارجي (externalMerchantId)</div>
                  <div className="mt-1 select-all break-all rounded-md bg-white px-3 py-2 font-mono text-sm">
                    {justLinked.publicReference}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">المفتاح السري (Secret)</div>
                  <div className="mt-1 select-all break-all rounded-md bg-white px-3 py-2 font-mono text-sm">
                    {justLinked.secret}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  رمز الوصول الكامل الذي يُستخدم في ترويسة Authorization لدى قيّدها هو:{' '}
                  <span className="font-mono">{`${justLinked.publicReference}.${justLinked.secret}`}</span>
                </div>
              </div>
              <div className="mt-3 rounded-md bg-white px-3 py-2 text-xs text-slate-500">
                احفظ هذا المفتاح الآن في مكان آمن داخل منصة قيّدها. إعادة الربط لاحقًا تُصدر مفتاحًا جديدًا وتُلغي
                هذا المفتاح فورًا.
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
