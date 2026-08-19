import { ReactNode, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../state/auth';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] flex-shrink-0"
    >
      {children}
    </svg>
  );
}

const NAV_ITEMS: { to: string; label: string; end?: boolean; icon: ReactNode }[] = [
  {
    to: '/',
    label: 'لوحة التحكم',
    end: true,
    icon: (
      <Icon>
        <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" />
        <rect x="11" y="11" width="6.5" height="6.5" rx="1.5" />
      </Icon>
    ),
  },
  {
    to: '/pos',
    label: 'نقطة البيع',
    icon: (
      <Icon>
        <path d="M2.5 4.5h2l.5 2M4.5 6.5h13l-1.3 6.5a1.5 1.5 0 0 1-1.47 1.2H6.9a1.5 1.5 0 0 1-1.47-1.2L4.5 6.5Z" />
        <circle cx="8" cy="17" r="1" />
        <circle cx="14" cy="17" r="1" />
      </Icon>
    ),
  },
  {
    to: '/sales',
    label: 'المبيعات والفواتير',
    icon: (
      <Icon>
        <path d="M5 2.5h10v15l-2.5-1.5-2.5 1.5-2.5-1.5-2.5 1.5v-15Z" />
        <path d="M7.2 7h5.6M7.2 10h5.6" />
      </Icon>
    ),
  },
  {
    to: '/products',
    label: 'المنتجات',
    icon: (
      <Icon>
        <path d="M10 2.5 2.5 6.5 10 10.5l7.5-4-7.5-4Z" />
        <path d="M2.5 6.5v7l7.5 4 7.5-4v-7" />
        <path d="M10 10.5v7" />
      </Icon>
    ),
  },
  {
    to: '/catalog',
    label: 'التصنيفات والعلامات والوحدات',
    icon: (
      <Icon>
        <path d="M10.8 2.5h4.2a2.5 2.5 0 0 1 2.5 2.5v4.2a1.5 1.5 0 0 1-.44 1.06l-7.5 7.5a1.5 1.5 0 0 1-2.12 0l-5.66-5.66a1.5 1.5 0 0 1 0-2.12l7.5-7.5A1.5 1.5 0 0 1 10.8 2.5Z" />
        <circle cx="13.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </Icon>
    ),
  },
  {
    to: '/inventory',
    label: 'المخزون',
    icon: (
      <Icon>
        <path d="M2.5 6 10 2.5 17.5 6v8L10 17.5 2.5 14V6Z" />
        <path d="M2.5 6 10 9.5 17.5 6M10 9.5v8" />
      </Icon>
    ),
  },
  {
    to: '/customers',
    label: 'العملاء',
    icon: (
      <Icon>
        <circle cx="7.5" cy="6.5" r="3" />
        <path d="M1.5 17c0-3 2.7-5 6-5s6 2 6 5" />
        <path d="M13.5 4a3 3 0 0 1 0 6" />
        <path d="M15 12.3c2.3.5 3.5 2.1 3.5 4.7" />
      </Icon>
    ),
  },
  {
    to: '/suppliers',
    label: 'الموردون',
    icon: (
      <Icon>
        <path d="M2.5 5.5h8v8h-8z" />
        <path d="M10.5 8.5h3.6L16.5 11v2.5h-6" />
        <circle cx="5.5" cy="15.5" r="1.4" />
        <circle cx="13.5" cy="15.5" r="1.4" />
      </Icon>
    ),
  },
  {
    to: '/purchases',
    label: 'المشتريات',
    icon: (
      <Icon>
        <path d="M4 6h12l-1 9.5a1.5 1.5 0 0 1-1.49 1.35H6.5A1.5 1.5 0 0 1 5 15.5L4 6Z" />
        <path d="M6.8 6V5a3.2 3.2 0 0 1 6.4 0v1" />
      </Icon>
    ),
  },
  {
    to: '/import',
    label: 'استيراد من Excel',
    icon: (
      <Icon>
        <path d="M10 13V3" />
        <path d="M6 7l4-4 4 4" />
        <path d="M3 13v2.5A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5V13" />
      </Icon>
    ),
  },
  {
    to: '/expenses',
    label: 'المصروفات',
    icon: (
      <Icon>
        <rect x="2.5" y="5" width="15" height="10.5" rx="2" />
        <path d="M2.5 8.5h15" />
        <circle cx="14" cy="12" r="1.1" fill="currentColor" stroke="none" />
      </Icon>
    ),
  },
  {
    to: '/accounting',
    label: 'الحسابات والقيود',
    icon: (
      <Icon>
        <rect x="3.5" y="2.5" width="13" height="15" rx="1.5" />
        <path d="M6.5 6.5h7M6.5 9.5h7M6.5 12.5h4" />
      </Icon>
    ),
  },
  {
    to: '/reports',
    label: 'التقارير المحاسبية',
    icon: (
      <Icon>
        <path d="M3 17V7M9.5 17V3M16 17v-9" />
        <path d="M2.5 17h15" />
      </Icon>
    ),
  },
  {
    to: '/receivables-payables',
    label: 'الذمم (العملاء والموردون)',
    icon: (
      <Icon>
        <path d="M3 7h11l-2.5-2.5" />
        <path d="M17 13H6l2.5 2.5" />
      </Icon>
    ),
  },
  {
    to: '/subscription',
    label: 'الاشتراك والخطة',
    icon: (
      <Icon>
        <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
        <path d="M2.5 8h15" />
        <path d="M5.5 12h3" />
      </Icon>
    ),
  },
  {
    to: '/integration',
    label: 'تكامل قيّدها',
    icon: (
      <Icon>
        <path d="M8 12 12 8" />
        <path d="M7 13.5 4.9 15.6a2.5 2.5 0 0 1-3.5-3.5L3.5 10" />
        <path d="M13 6.5l2.1-2.1a2.5 2.5 0 0 1 3.5 3.5L16.5 10" />
      </Icon>
    ),
  },
];

/**
 * Milestone 2 "Responsive": the sidebar used to be a fixed w-64 flex child
 * with no mobile behavior - on a narrow screen it ate most of the viewport
 * and squeezed every page's content into a sliver. Now it's an off-canvas
 * drawer below the `md` breakpoint (toggled by a top bar hamburger button)
 * and the original always-visible sidebar unchanged at `md` and above -
 * same nav items, same links, no redesign of navigation structure (visual
 * styling only).
 */
interface SubscriptionBanner {
  isRestricted: boolean;
  status: string;
  trialDaysRemaining: number | null;
}

export function Layout() {
  const { me, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionBanner | null>(null);

  // Milestone 8: a lightweight, best-effort fetch (never blocks rendering,
  // never shows an error banner of its own on failure) purely to surface
  // subscription restrictions/trial countdown app-wide - "restrictions must
  // be visible and understandable" (Milestone 8 spec section 13).
  useEffect(() => {
    api
      .get('/subscriptions/me')
      .then((data) =>
        setSubscription({
          isRestricted: data.isRestricted,
          status: data.status,
          trialDaysRemaining: data.trialDaysRemaining,
        }),
      )
      .catch(() => setSubscription(null));
  }, []);

  const showTrialNotice =
    subscription && !subscription.isRestricted && subscription.status === 'trialing' &&
    subscription.trialDaysRemaining !== null && subscription.trialDaysRemaining <= 3;

  const initial = (me?.fullName ?? '؟').trim().charAt(0);

  const navLinks = (
    <>
      <div className="flex items-center gap-2.5 border-b border-white/10 p-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/15 text-base font-extrabold">
          ق
        </div>
        <div>
          <div className="text-base font-bold leading-tight">Qeedha Accounting</div>
          <div className="text-xs text-white/60">النظام المحاسبي ونقاط البيع</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileNavOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-white/15 font-semibold text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-lg px-1 py-1">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{me?.fullName}</div>
            <div className="truncate text-xs text-white/55">{me?.roles.map((r) => r.name).join('، ') || '—'}</div>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="w-full rounded-lg px-3 py-1.5 text-start text-xs text-white/75 transition-colors hover:bg-white/10 hover:text-white"
        >
          تسجيل الخروج
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="flex items-center justify-between bg-brand-900 p-3 text-white md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-sm font-extrabold">
            ق
          </div>
          <span className="text-base font-bold">Qeedha Accounting</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm transition-colors hover:bg-white/10"
          aria-label="فتح القائمة"
        >
          ☰ القائمة
        </button>
      </div>

      <aside className="hidden w-64 flex-col bg-brand-900 text-white md:flex">{navLinks}</aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="flex w-72 max-w-[85vw] flex-col bg-brand-900 text-white shadow-popover">{navLinks}</div>
          <div
            className="flex-1 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        </div>
      )}

      <main className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8">
        {subscription?.isRestricted && (
          <NavLink
            to="/subscription"
            className="mb-4 block rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 transition-colors hover:bg-red-100"
          >
            انتهت صلاحية الاشتراك أو تم إيقافه - يمكنك الاطلاع على بياناتك الحالية، ولإجراء عمليات جديدة يرجى
            التواصل مع الدعم لتجديد الاشتراك. عرض تفاصيل الاشتراك ←
          </NavLink>
        )}
        {showTrialNotice && (
          <NavLink
            to="/subscription"
            className="mb-4 block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition-colors hover:bg-amber-100"
          >
            متبقٍ {subscription!.trialDaysRemaining} {subscription!.trialDaysRemaining === 1 ? 'يوم' : 'أيام'} على
            انتهاء الفترة التجريبية. عرض تفاصيل الاشتراك ←
          </NavLink>
        )}
        <Outlet />
      </main>
    </div>
  );
}
