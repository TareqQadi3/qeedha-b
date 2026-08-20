import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api/client';
import { Button, ErrorBanner, Field, Input } from '../../components/ui';
import { IconArrowStart, PageHero } from '../components';
import { SitePageContainer } from '../SiteLayout';

/** Public affiliate self-registration - Website phase spec "Affiliate system". The referral link is built as `<site>/register?ref=<code>`, consumed by RegisterPage/AuthService first-touch attribution. Phase 9 adds a password so the affiliate can log into their own dashboard right after. */
export function AffiliatePage() {
  const { t } = useTranslation('site');
  const [form, setForm] = useState({ fullName: '', email: '', mobile: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code: string } | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post('/affiliates/register', {
        fullName: form.fullName,
        email: form.email,
        mobile: form.mobile || undefined,
        password: form.password,
      });
      setResult({ code: res.code });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('affiliate.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const referralUrl = `${window.location.origin}/register?ref=${result.code}`;
    return (
      <div>
        <PageHero eyebrow={t('nav.affiliate')} title={t('affiliate.successTitle')} />
        <SitePageContainer>
          <div className="mx-auto max-w-md text-center">
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-start shadow-card">
              <div>
                <div className="text-xs font-medium text-slate-500">{t('affiliate.codeLabel')}</div>
                <div className="font-mono text-lg font-bold text-brand-700" dir="ltr">
                  {result.code}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">{t('affiliate.linkLabel')}</div>
                <div className="break-all font-mono text-sm text-slate-700" dir="ltr">
                  {referralUrl}
                </div>
              </div>
            </div>
            <Link
              to="/affiliate/login"
              className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              {t('affiliate.goToLogin')}
              <IconArrowStart />
            </Link>
          </div>
        </SitePageContainer>
      </div>
    );
  }

  return (
    <div>
      <PageHero eyebrow={t('nav.affiliate')} title={t('affiliate.title')} subtitle={t('affiliate.subtitle')} />
      <SitePageContainer>
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <form onSubmit={onSubmit} className="space-y-4">
          <ErrorBanner message={error} />
          <Field label={t('affiliate.fields.fullName')}>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          </Field>
          <Field label={t('affiliate.fields.email')}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required dir="ltr" />
          </Field>
          <Field label={t('affiliate.fields.mobile')}>
            <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} dir="ltr" />
          </Field>
          <Field label={t('affiliate.fields.password')}>
            <Input
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              dir="ltr"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t('affiliate.submitting') : t('affiliate.submit')}
          </Button>
          <p className="text-center text-sm text-slate-500">
            {t('affiliate.hasAccountPrompt')}{' '}
            <Link to="/affiliate/login" className="font-medium text-brand-600 hover:underline">
              {t('affiliate.loginLink')}
            </Link>
          </p>
        </form>
      </div>
      </SitePageContainer>
    </div>
  );
}
