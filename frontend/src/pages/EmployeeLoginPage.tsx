import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input, Select } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAuth } from '../state/auth';

interface BranchOption {
  id: string;
  name: string;
}

export function EmployeeLoginPage() {
  const { t } = useTranslation(['auth', 'nav']);
  const { employeeLogin } = useAuth();
  const navigate = useNavigate();

  const [subscriptionNumber, setSubscriptionNumber] = useState('');
  const [branches, setBranches] = useState<BranchOption[] | null>(null);
  const [companyLegalName, setCompanyLegalName] = useState<string | null>(null);
  const [branchId, setBranchId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loading, setLoading] = useState(false);

  const onLookupBranches = async () => {
    if (!subscriptionNumber) return;
    setError(null);
    setBranches(null);
    setBranchId('');
    setLoadingBranches(true);
    try {
      const res = await api.get(`/auth/companies/${subscriptionNumber}/branches`);
      setCompanyLegalName(res.companyLegalName);
      setBranches(res.branches);
      if (res.branches.length === 1) {
        setBranchId(res.branches[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('genericConnectionError'));
    } finally {
      setLoadingBranches(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await employeeLogin(Number(subscriptionNumber), branchId, username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('genericConnectionError'));
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
          <h1 className="mb-1 text-xl font-bold text-slate-900">{t('employeeLogin.title')}</h1>
          <p className="mb-5 text-sm text-slate-500">{t('employeeLogin.subtitle')}</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorBanner message={error} />
            <Field label={t('fields.subscriptionNumber')}>
              <div className="flex gap-2">
                <Input
                  value={subscriptionNumber}
                  onChange={(e) => setSubscriptionNumber(e.target.value.replace(/\D/g, ''))}
                  onBlur={onLookupBranches}
                  inputMode="numeric"
                  required
                  autoFocus
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onLookupBranches}
                  disabled={!subscriptionNumber || loadingBranches}
                >
                  {loadingBranches ? '...' : t('employeeLogin.lookupBranch')}
                </Button>
              </div>
            </Field>

            {branches && (
              <Field label={t('fields.branch')}>
                {companyLegalName && <p className="mb-1 text-xs text-slate-500">{companyLegalName}</p>}
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
                  <option value="" disabled>
                    {t('employeeLogin.selectBranch')}
                  </option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label={t('fields.username')}>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </Field>
            <Field label={t('fields.password')}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Button type="submit" className="w-full" disabled={loading || !branchId}>
              {loading ? t('login.submitting') : t('login.submit')}
            </Button>
            <p className="text-center text-sm text-slate-500">
              <Link to="/login" className="font-medium text-brand-600 hover:underline">
                {t('employeeLogin.backToOwnerLogin')}
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
