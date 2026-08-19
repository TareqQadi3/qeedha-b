import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Button, Card } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

type Status = 'verifying' | 'success' | 'error';

/** Lands here from the verification email link (`WEBSITE_BASE_URL/verify-email?token=...` - see EmailService). Public - no session required to consume the token. */
export function VerifyEmailPage() {
  const { t } = useTranslation(['auth', 'nav']);
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('verifyEmail.missingToken'));
      return;
    }
    api
      .post('/auth/verify-email', { token }, true)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof ApiError ? err.message : t('genericConnectionError'));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
        <Card className="w-full text-center">
          {status === 'verifying' && <p className="text-sm text-slate-500">{t('verifyEmail.verifying')}</p>}
          {status === 'success' && (
            <>
              <h1 className="mb-2 text-xl font-bold text-emerald-700">{t('verifyEmail.successTitle')}</h1>
              <p className="mb-5 text-sm text-slate-500">{t('verifyEmail.successBody')}</p>
              <Link to="/">
                <Button className="w-full">{t('verifyEmail.continueToApp')}</Button>
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <h1 className="mb-2 text-xl font-bold text-red-700">{t('verifyEmail.errorTitle')}</h1>
              <p className="mb-5 text-sm text-slate-500">{message}</p>
              <Link to="/login">
                <Button variant="secondary" className="w-full">
                  {t('verifyEmail.backToLogin')}
                </Button>
              </Link>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
