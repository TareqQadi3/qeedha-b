import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError, setSession } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAuth } from '../state/auth';

export function RegisterPage() {
  const { t } = useTranslation(['auth', 'nav']);
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const [form, setForm] = useState({
    legalName: '',
    vatNumber: '',
    ownerFullName: '',
    ownerEmail: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = { ...form, vatNumber: form.vatNumber.trim() || undefined };
      const res = await api.post('/auth/register-company', payload, true);
      setSession(res.accessToken, res.refreshToken);
      await refreshMe();
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('companyCreationError'));
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
          <h1 className="mb-1 text-xl font-bold text-slate-900">{t('register.title')}</h1>
          <p className="mb-5 text-sm text-slate-500">{t('register.subtitle')}</p>
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
