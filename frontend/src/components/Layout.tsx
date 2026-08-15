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
];

export function Layout() {
  const { me, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col bg-brand-700 text-white">
        <div className="border-b border-white/10 p-4">
          <div className="text-lg font-bold">Qeedha Accounting</div>
          <div className="text-xs text-white/70">النظام المحاسبي ونقاط البيع</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
      </aside>
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <Outlet />
      </main>
    </div>
  );
}
