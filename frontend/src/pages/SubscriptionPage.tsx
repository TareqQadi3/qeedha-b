import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Badge, Card, ErrorBanner, PageHeader } from '../components/ui';

const money = (n: number | string | null) => (n === null ? null : Number(n).toFixed(2));

const FEATURE_LABELS: Record<string, string> = {
  pos: 'نقطة البيع',
  inventory: 'إدارة المخزون',
  accounting: 'الحسابات والقيود',
  reports: 'التقارير المحاسبية',
  excel_import: 'الاستيراد من Excel',
  zatca: 'الفوترة الإلكترونية (زاتكا - المرحلة الأولى)',
  ar_ap: 'الذمم المدينة والدائنة',
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  trialing: { label: 'فترة تجريبية', className: 'bg-blue-50 text-blue-700' },
  active: { label: 'نشط', className: 'bg-green-50 text-green-700' },
  expired: { label: 'منتهي الصلاحية', className: 'bg-amber-50 text-amber-700' },
  suspended: { label: 'موقوف', className: 'bg-red-50 text-red-700' },
  cancelled: { label: 'ملغى', className: 'bg-red-50 text-red-700' },
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
  const pct = usage.limit ? Math.min(100, Math.round((usage.current / usage.limit) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-800">
          {usage.current} / {usage.limit === null ? 'غير محدود' : usage.limit}
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
  const [data, setData] = useState<SubscriptionMe | null>(null);
  const [plans, setPlans] = useState<PlanCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.get('/subscriptions/me'), api.get('/subscriptions/plans')])
      .then(([me, planList]) => {
        setData(me);
        setPlans(planList);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'تعذّر تحميل بيانات الاشتراك'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="الاشتراك والخطة" />
        <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader title="الاشتراك والخطة" />
        <ErrorBanner message={error ?? 'تعذّر تحميل بيانات الاشتراك'} />
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[data.status] ?? { label: data.status, className: 'bg-slate-100 text-slate-700' };
  const priceLabel = data.plan.priceMonthlySar === null ? 'تواصل مع الدعم' : `${money(data.plan.priceMonthlySar)} ر.س / شهريًا`;

  return (
    <div className="space-y-4">
      <PageHeader title="الاشتراك والخطة" />

      {data.isRestricted && (
        <ErrorBanner message="انتهت صلاحية الاشتراك الحالي أو تم إيقافه. يمكنك الاطلاع على بياناتك الحالية، ولإجراء عمليات جديدة يرجى التواصل مع الدعم لتجديد الاشتراك." />
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">الخطة الحالية</div>
            <div className="text-lg font-bold text-slate-800">{data.plan.name}</div>
            {data.plan.description && <div className="mt-1 text-sm text-slate-500">{data.plan.description}</div>}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        </div>

        <div className="mt-3 text-sm text-slate-600">
          السعر: <span className="font-medium text-slate-800">{priceLabel}</span>
          <span className="mr-1 text-xs text-slate-400">(سعر تقديري مبدئي - غير نهائي)</span>
        </div>

        {data.status === 'trialing' && data.trialDaysRemaining !== null && (
          <div className="mt-2 text-sm text-blue-700">
            متبقٍ {data.trialDaysRemaining} {data.trialDaysRemaining === 1 ? 'يوم' : 'أيام'} على انتهاء الفترة التجريبية
          </div>
        )}

        <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">{data.billingNote}</div>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700">الميزات المتاحة في هذه الخطة</div>
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
        <div className="mb-3 text-sm font-semibold text-slate-700">حدود الاستخدام</div>
        <div className="space-y-3">
          <UsageRow label="المستخدمون" usage={data.usage.users} />
          <UsageRow label="الفروع" usage={data.usage.branches} />
          <UsageRow label="مبيعات هذا الشهر" usage={data.usage.monthlySales} />
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700">الخطط المتاحة</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {plans.map((plan) => (
            <div
              key={plan.code}
              className={`rounded-xl border p-3 transition-colors ${plan.code === data.plan.code ? 'border-brand-500 bg-brand-50/40' : 'border-slate-200'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">{plan.name}</span>
                {plan.code === data.plan.code && <Badge variant="brand">الخطة الحالية</Badge>}
              </div>
              {plan.description && <div className="mt-1 text-xs text-slate-500">{plan.description}</div>}
              <div className="mt-2 text-sm text-slate-700">
                {plan.priceMonthlySar === null ? 'تواصل مع الدعم' : `${money(plan.priceMonthlySar)} ر.س / شهريًا`}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                المستخدمون: {plan.maxUsers ?? 'غير محدود'} · الفروع: {plan.maxBranches ?? 'غير محدود'} · مبيعات شهرية:{' '}
                {plan.maxMonthlySales ?? 'غير محدود'}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          إدارة الفوترة والترقية بين الخطط ستكون متاحة قريبًا عبر مركز التحكم في Qeedha. للترقية أو الاستفسار حول
          الفوترة، يرجى التواصل مع الدعم.
        </div>
      </Card>
    </div>
  );
}
