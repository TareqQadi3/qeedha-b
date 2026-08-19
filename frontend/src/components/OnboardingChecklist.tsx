import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Card } from './ui';
import { useAuth } from '../state/auth';

const DISMISSED_KEY = 'qeedha_onboarding_dismissed';

interface Step {
  key: string;
  to: string;
  permission: string;
  /** Undefined = always done (created automatically at registration). */
  check?: () => Promise<boolean>;
}

const STEPS: Step[] = [
  { key: 'company', to: '/', permission: 'products.read' },
  { key: 'branch', to: '/', permission: 'products.read' },
  { key: 'warehouse', to: '/', permission: 'products.read' },
  {
    key: 'product',
    to: '/products',
    permission: 'products.read',
    check: async () => (await api.get('/products', { page: 1, pageSize: 1 })).meta.total > 0,
  },
  {
    key: 'inventory',
    to: '/inventory',
    permission: 'inventory.read',
    check: async () => (await api.get('/inventory/stock-levels', { page: 1, pageSize: 1 })).meta.total > 0,
  },
  {
    key: 'customer',
    to: '/customers',
    permission: 'customers.read',
    check: async () => (await api.get('/customers', { page: 1, pageSize: 1 })).meta.total > 0,
  },
  {
    key: 'supplier',
    to: '/suppliers',
    permission: 'suppliers.read',
    check: async () => (await api.get('/suppliers', { page: 1, pageSize: 1 })).meta.total > 0,
  },
  {
    key: 'sale',
    to: '/pos',
    permission: 'sales.read',
    check: async () => (await api.get('/invoices', { page: 1, pageSize: 1 })).meta.total > 0,
  },
];

/**
 * Milestone 2 "Onboarding": a short checklist guiding a new merchant to
 * their first sale, not a multi-screen wizard. Company/Branch/Warehouse are
 * always shown as done (registerCompany creates them atomically - see
 * AuthService.registerCompany) so the list reads as one continuous path
 * rather than starting mid-way. Steps the member lacks permission for are
 * skipped (not counted against completion) - a Cashier without
 * suppliers.read isn't blocked from ever seeing "all done". Dismissible and
 * auto-hides once every visible step is complete.
 */
export function OnboardingChecklist() {
  const { t } = useTranslation('onboarding');
  const { hasPermission } = useAuth();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  const visibleSteps = STEPS.filter((s) => hasPermission(s.permission));

  useEffect(() => {
    if (dismissed || visibleSteps.length === 0) return;
    Promise.allSettled(
      visibleSteps.map(async (s) => [s.key, s.check ? await s.check() : true] as const),
    ).then((results) => {
      const next: Record<string, boolean> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') next[r.value[0]] = r.value[1];
      }
      setDone(next);
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed]);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  if (dismissed || visibleSteps.length === 0) return null;
  const allDone = loaded && visibleSteps.every((s) => done[s.key]);
  if (allDone) return null;

  return (
    <Card className="mb-6 bg-brand-50">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-slate-800">{t('heading')}</h2>
        <button onClick={dismiss} className="text-xs text-slate-500 hover:underline">
          {t('dismiss')}
        </button>
      </div>
      <ul className="space-y-2">
        {visibleSteps.map((step) => (
          <li key={step.key} className="flex items-center gap-2 text-sm">
            <span className={done[step.key] ? 'text-emerald-600' : 'text-slate-300'}>
              {done[step.key] ? '✓' : '○'}
            </span>
            {done[step.key] ? (
              <span className="text-slate-500 line-through">{t(`steps.${step.key}`)}</span>
            ) : (
              <Link to={step.to} className="text-brand-700 hover:underline">
                {t(`steps.${step.key}`)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
