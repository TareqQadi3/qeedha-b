import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAdminAuth } from './AdminAuthContext';
import { AffiliatesTab } from './tabs/AffiliatesTab';
import { ApplicationsTab } from './tabs/ApplicationsTab';
import { MarketsTab } from './tabs/MarketsTab';
import { MerchantsTab } from './tabs/MerchantsTab';
import { OverviewTab } from './tabs/OverviewTab';
import { PlansTab } from './tabs/PlansTab';
import { StaffTab } from './tabs/StaffTab';

type TabKey = 'overview' | 'merchants' | 'plans' | 'markets' | 'affiliates' | 'applications' | 'staff';

/**
 * SaaS control panel (docs/DOMAIN_MODEL.md "Platform admin", Website phase
 * spec "Control Center") - a completely separate area from the merchant
 * dashboard, for Qeedha platform staff only. Which tabs render is driven
 * entirely by `admin.role`, mirroring PlatformAdminRoleGuard's route
 * restrictions exactly (Overview/Merchants read is open to every role;
 * Plans/Markets/Staff are admin-only; Affiliates is finance/marketing;
 * Applications is marketing/support) - a staff member never sees a tab
 * whose actions the backend would reject for their role ("do not give
 * every employee full admin access").
 */
export function AdminDashboardPage() {
  const { t } = useTranslation('admin');
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('overview');

  if (!admin) return null;
  const role = admin.role;
  const isAdmin = role === 'admin';

  const visibleTabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: t('tabs.overview') },
    { key: 'merchants', label: t('tabs.merchants') },
    ...(isAdmin ? [{ key: 'plans' as const, label: t('tabs.plans') }] : []),
    ...(isAdmin ? [{ key: 'markets' as const, label: t('tabs.markets') }] : []),
    ...(isAdmin || role === 'finance' || role === 'marketing'
      ? [{ key: 'affiliates' as const, label: t('tabs.affiliates') }]
      : []),
    ...(isAdmin || role === 'marketing' || role === 'support'
      ? [{ key: 'applications' as const, label: t('tabs.applications') }]
      : []),
    ...(isAdmin ? [{ key: 'staff' as const, label: t('tabs.staff') }] : []),
  ];

  const onLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-base font-extrabold text-white">
            ق
          </div>
          <div>
            <div className="text-base font-bold leading-tight text-slate-900">{t('appName')}</div>
            <div className="text-xs text-slate-500">
              {admin.fullName} · {t(`staff.roles.${role}`)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="secondary" onClick={onLogout}>
            {t('dashboard.logout')}
          </Button>
        </div>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {visibleTabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`whitespace-nowrap px-3 py-2.5 text-sm font-semibold transition-colors ${
              tab === tb.key ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'merchants' && <MerchantsTab role={role} />}
      {tab === 'plans' && isAdmin && <PlansTab />}
      {tab === 'markets' && isAdmin && <MarketsTab />}
      {tab === 'affiliates' && (isAdmin || role === 'finance' || role === 'marketing') && <AffiliatesTab />}
      {tab === 'applications' && (isAdmin || role === 'marketing' || role === 'support') && <ApplicationsTab />}
      {tab === 'staff' && isAdmin && <StaffTab />}
    </div>
  );
}
