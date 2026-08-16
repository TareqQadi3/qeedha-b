import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../state/auth';

const NAV_ITEMS = [
  { to: '/', label: 'لوحة التحكم', end: true },
  { to: '/pos', label: 'نقطة البيع' },
  { to: '/sales', label: 'المبيعات والفواتير' },
  { to: '/products', label: 'المنتجات' },
  { to: '/catalog', label: 'التصنيفات والعلامات والوحدات' },
  { to: '/inventory', label: 'المخزون' },
  { to: '/customers', label: 'العملاء' },
  { to: '/suppliers', label: 'الموردون' },
  { to: '/purchases', label: 'المشتريات' },
  { to: '/import', label: 'استيراد من Excel' },
  { to: '/expenses', label: 'المصروفات' },
  { to: '/accounting', label: 'الحسابات والقيود' },
  { to: '/reports', label: 'التقارير المحاسبية' },
  { to: '/receivables-payables', label: 'الذمم (العملاء والموردون)' },
];

/**
 * Milestone 2 "Responsive": the sidebar used to be a fixed w-64 flex child
 * with no mobile behavior - on a narrow screen it ate most of the viewport
 * and squeezed every page's content into a sliver. Now it's an off-canvas
 * drawer below the `md` breakpoint (toggled by a top bar hamburger button)
 * and the original always-visible sidebar unchanged at `md` and above -
 * same nav items, same links, no redesign.
 */
export function Layout() {
  const { me, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navLinks = (
    <>
      <div className="border-b border-white/10 p-4">
        <div className="text-lg font-bold">Qeedha Accounting</div>
        <div className="text-xs text-white/70">النظام المحاسبي ونقاط البيع</div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileNavOpen(false)}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-white/15 font-semibold' : 'text-white/85 hover:bg-white/10'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3 text-sm">
        <div className="mb-2 truncate">{me?.fullName}</div>
        <div className="mb-2 truncate text-xs text-white/60">
          {me?.roles.map((r) => r.name).join('، ') || '—'}
        </div>
        <button onClick={() => logout()} className="text-xs text-white/80 underline hover:text-white">
          تسجيل الخروج
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="flex items-center justify-between bg-brand-700 p-3 text-white md:hidden">
        <span className="text-base font-bold">Qeedha Accounting</span>
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="rounded-md border border-white/20 px-3 py-1.5 text-sm"
          aria-label="فتح القائمة"
        >
          ☰ القائمة
        </button>
      </div>

      <aside className="hidden w-64 flex-col bg-brand-700 text-white md:flex">{navLinks}</aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="flex w-72 max-w-[85vw] flex-col bg-brand-700 text-white">{navLinks}</div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileNavOpen(false)} />
        </div>
      )}

      <main className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
