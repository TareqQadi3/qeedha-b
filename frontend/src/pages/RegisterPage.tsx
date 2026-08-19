import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError, setSession } from '../api/client';
import { Badge, Button, Card, ErrorBanner, Field, Input } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAuth } from '../state/auth';

interface WebsitePlan {
  code: string;
  name: string;
  priceMonthlySar: string | null;
  products: string[];
}

/**
 * Registration entry point for both the plain in-app "create a company"
 * flow (no query params, unchanged from before the Website phase) and the
 * marketing website's pricing-page hand-off: `?plan=<code>&country=<SA>
 * &ref=<affiliateCode>`. All three are optional and read-only here (the
 * actual choice happens on the public /site/pricing page) - this just
 * carries them through to POST /auth/register-company and shows a small
 * confirmation summary so the merchant sees what they're signing up for.
 */
export function RegisterPage() {
  const { t } = useTranslation(['auth', 'nav']);
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const [params] = useSearchParams();
  const planCode = params.get('plan') ?? undefined;
  const countryCode = params.get('country') ?? undefined;
  const referralCode = params.get('ref') ?? undefined;

  const [selectedPlan, setSelectedPlan] = useState<WebsitePlan | null>(null);

  const [form, setForm] = useState({
    legalName: '',
    vatNumber: '',
    ownerFullName: '',
    ownerEmail: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState<{ email: string } | null>(null);

  useEffect(() => {
    if (!planCode) return;
    api
      .get('/website/plans')
      .then((plans: WebsitePlan[]) => setSelectedPlan(plans.find((p) => p.code === planCode) ?? null))
      .catch(() => setSelectedPlan(null));
  }, [planCode]);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        ...form,
        vatNumber: form.vatNumber.trim() || undefined,
        countryCode,
        planCode,
        referralCode,
      };
      const res = await api.post('/auth/register-company', payload, true);
      setSession(res.accessToken, res.refreshToken);
      await refreshMe();
      setRegistered({ email: form.ownerEmail });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('companyCreationError'));
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-4">
        <Card className="w-full max-w-sm text-center">
          <h1 className="mb-2 text-xl font-bold text-slate-900">{t('register.successTitle')}</h1>
          <p className="mb-5 text-sm text-slate-500">
            {t('register.successBody', { email: registered.email })}
          </p>
          <Button className="w-full" onClick={() => navigate('/')}>
            {t('register.continueToApp')}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex flex-col items-center gap-2 text-white">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-xl font-extrabold">
            ق
          </div>
          <div className="text-lg font-bold">{t('nav:appName')}</div>
          <LanguageSwitcher />
        </div>
        <Card className="w-full">
          <h1 className="mb-1 text-xl font-bold text-slate-900">{t('register.title')}</h1>
          <p className="mb-5 text-sm text-slate-500">{t('register.subtitle')}</p>

          {(selectedPlan || countryCode) && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 p-3">
              {selectedPlan && (
                <Badge variant="brand">
                  {selectedPlan.name}
                  {selectedPlan.priceMonthlySar ? ` - ${selectedPlan.priceMonthlySar} ${t('register.sarPerMonth')}` : ''}
                </Badge>
              )}
              {countryCode && <Badge variant="brand">{countryCode}</Badge>}
              {referralCode && <span className="text-xs text-slate-500">{t('register.referredBy')}</span>}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorBanner message={error} />
            <Field label={t('fields.companyName')}>
              <Input value={form.legalName} onChange={update('legalName')} required />
            </Field>
            <Field label={t('fields.vatNumber')}>
              <Input value={form.vatNumber} onChange={update('vatNumber')} />
            </Field>
            <Field label={t('fields.fullName')}>
              <Input value={form.ownerFullName} onChange={update('ownerFullName')} required />
            </Field>
            <Field label={t('fields.email')}>
              <Input type="email" value={form.ownerEmail} onChange={update('ownerEmail')} required />
            </Field>
            <Field label={t('fields.password')}>
              <Input type="password" minLength={8} value={form.password} onChange={update('password')} required />
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('register.submitting') : t('register.submit')}
            </Button>
            <p className="text-center text-sm text-slate-500">
              {t('register.hasAccountPrompt')}{' '}
              <Link to="/login" className="font-medium text-brand-600 hover:underline">
                {t('register.loginLink')}
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
