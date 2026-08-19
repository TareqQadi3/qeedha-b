import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAffiliateAuth } from './AffiliateAuthContext';

/** Phase 9 "Affiliate Dashboard" self-service login. */
export function AffiliateLoginPage() {
  const { t } = useTranslation(['site', 'nav']);
  const { login } = useAffiliateAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/affiliate/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('affiliate.error'));
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="mb-1 text-xl font-bold text-slate-900">{t('affiliate.loginTitle')}</h1>
          <p className="mb-5 text-sm text-slate-500">{t('affiliate.loginSubtitle')}</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorBanner message={error} />
            <Field label={t('affiliate.fields.email')}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus dir="ltr" />
            </Field>
            <Field label={t('affiliate.loginPassword')}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('affiliate.submitting') : t('affiliate.loginSubmit')}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
