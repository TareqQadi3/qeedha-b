import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAuth } from '../state/auth';

export function LoginPage() {
  const { t } = useTranslation(['auth', 'nav']);
  const { login, selectTenant } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tenantChoice, setTenantChoice] = useState<{
    tenantSelectionToken: string;
    availableCompanies: { companyId: string; legalName: string; tradeName: string | null }[];
  } | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(identifier, password);
      if (result.kind === 'select-tenant') {
        setTenantChoice(result);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('genericConnectionError'));
    } finally {
      setLoading(false);
    }
  };

  const onSelectTenant = async (companyId: string) => {
    if (!tenantChoice) return;
    setError(null);
    setLoading(true);
    try {
      await selectTenant(tenantChoice.tenantSelectionToken, companyId);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('tenantSelectionError'));
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
          <h1 className="mb-1 text-xl font-bold text-slate-900">{t('login.title')}</h1>
          <p className="mb-5 text-sm text-slate-500">{t('login.subtitle')}</p>

          {!tenantChoice ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <ErrorBanner message={error} />
              <Field label={t('fields.identifier')}>
                <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
              </Field>
              <Field label={t('fields.password')}>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('login.submitting') : t('login.submit')}
              </Button>
              <p className="text-center text-sm text-slate-500">
                {t('login.noAccountPrompt')}{' '}
                <Link to="/register" className="font-medium text-brand-600 hover:underline">
                  {t('login.registerLink')}
                </Link>
              </p>
            </form>
          ) : (
            <div className="space-y-3">
              <ErrorBanner message={error} />
              <p className="text-sm text-slate-600">{t('login.chooseTenantPrompt')}</p>
              {tenantChoice.availableCompanies.map((c) => (
                <button
                  key={c.companyId}
                  onClick={() => onSelectTenant(c.companyId)}
                  disabled={loading}
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-start text-sm transition-colors hover:border-brand-500 hover:bg-brand-50"
                >
                  <div className="font-medium">{c.legalName}</div>
                  {c.tradeName && <div className="text-xs text-slate-500">{c.tradeName}</div>}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
