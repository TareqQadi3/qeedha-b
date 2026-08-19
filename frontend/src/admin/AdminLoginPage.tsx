import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAdminAuth } from './AdminAuthContext';

export function AdminLoginPage() {
  const { t } = useTranslation('admin');
  const { login } = useAdminAuth();
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
      navigate('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('login.genericConnectionError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex flex-col items-center gap-2 text-white">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-xl font-extrabold">
            ق
          </div>
          <div className="text-lg font-bold">{t('appName')}</div>
          <LanguageSwitcher />
        </div>
        <Card className="w-full">
          <h1 className="mb-1 text-xl font-bold text-slate-900">{t('login.title')}</h1>
          <p className="mb-5 text-sm text-slate-500">{t('login.subtitle')}</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorBanner message={error} />
            <Field label={t('fields.email')}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus dir="ltr" />
            </Field>
            <Field label={t('fields.password')}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('login.submitting') : t('login.submit')}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
