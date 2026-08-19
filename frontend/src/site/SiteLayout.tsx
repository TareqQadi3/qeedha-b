import { ReactNode, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage, SupportedLanguage } from '../i18n';

const NAV_LINKS: { to: string; key: string }[] = [
  { to: '/site', key: 'home' },
  { to: '/site/qeedha-b', key: 'qeedhaB' },
  { to: '/site/qeedha', key: 'qeedha' },
  { to: '/site/combined', key: 'combined' },
  { to: '/site/pricing', key: 'pricing' },
  { to: '/site/features', key: 'features' },
  { to: '/site/about', key: 'about' },
];

/** Public marketing site header language toggle - styled for a light header background, unlike the shared LanguageSwitcher (built for the dark auth-page hero). */
function SiteLanguageSwitcher() {
  const { t, i18n } = useTranslation('nav');
  const current = i18n.language as SupportedLanguage;
  const options: { code: SupportedLanguage; label: string }[] = [
    { code: 'ar', label: t('languageArabic') },
    { code: 'en', label: t('languageEnglish') },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 text-xs">
      {options.map((option) => (
        <button
          key={option.code}
          type="button"
          onClick={() => setLanguage(option.code)}
          aria-pressed={current === option.code}
          className={`rounded-md px-2 py-1 font-medium transition-colors ${
            current === option.code ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SiteHeader() {
  const { t } = useTranslation('site');
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/site" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-extrabold text-white">
            ق
          </div>
          <span className="text-base font-bold text-slate-900">قيّدها</span>
        </Link>

        <nav className="hidden items-center gap-5 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/site'}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? 'text-brand-700' : 'text-slate-600 hover:text-slate-900'}`
              }
            >
              {t(`nav.${link.key}`)}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <SiteLanguageSwitcher />
          <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            {t('nav.login')}
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            {t('nav.startTrial')}
          </Link>
        </div>

        <button
          className="rounded-lg border border-slate-200 p-2 lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="menu"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
            <path strokeLinecap="round" d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
          <nav className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/site'}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-slate-700"
              >
                {t(`nav.${link.key}`)}
              </NavLink>
            ))}
            <div className="mt-2 flex items-center justify-between">
              <SiteLanguageSwitcher />
              <Link to="/login" className="text-sm font-medium text-slate-600">
                {t('nav.login')}
              </Link>
            </div>
            <Link
              to="/register"
              className="rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white"
            >
              {t('nav.startTrial')}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

function SiteFooter() {
  const { t } = useTranslation('site');
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-700 text-xs font-extrabold text-white">
              ق
            </div>
            <span className="text-sm font-bold text-slate-900">قيّدها</span>
          </div>
          <p className="text-sm text-slate-500">{t('footer.tagline')}</p>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-900">{t('footer.product')}</div>
          <ul className="space-y-1.5 text-sm text-slate-500">
            <li>
              <Link to="/site/pricing" className="hover:text-slate-800">
                {t('nav.pricing')}
              </Link>
            </li>
            <li>
              <Link to="/site/features" className="hover:text-slate-800">
                {t('nav.features')}
              </Link>
            </li>
            <li>
              <Link to="/site/affiliate" className="hover:text-slate-800">
                {t('nav.affiliate')}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-900">{t('footer.company')}</div>
          <ul className="space-y-1.5 text-sm text-slate-500">
            <li>
              <Link to="/site/about" className="hover:text-slate-800">
                {t('nav.about')}
              </Link>
            </li>
            <li>
              <Link to="/site/contact" className="hover:text-slate-800">
                {t('nav.contact')}
              </Link>
            </li>
            <li>
              <Link to="/site/faq" className="hover:text-slate-800">
                {t('nav.faq')}
              </Link>
            </li>
            <li>
              <Link to="/site/join-us" className="hover:text-slate-800">
                {t('nav.joinUs')}
              </Link>
            </li>
            <li>
              <Link to="/site/terms" className="hover:text-slate-800">
                {t('footer.terms')}
              </Link>
            </li>
            <li>
              <Link to="/site/privacy" className="hover:text-slate-800">
                {t('footer.privacy')}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-400">
        {t('footer.rights', { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}

export function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

export function SitePageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-5xl px-4 py-14">{children}</div>;
}
