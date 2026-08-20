import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage, SupportedLanguage } from '../i18n';
import { IconShield } from './components';

const NAV_LINKS: { to: string; key: string }[] = [
  { to: '/site', key: 'home' },
  { to: '/site/qeedha-b', key: 'qeedhaB' },
  { to: '/site/qeedha', key: 'qeedha' },
  { to: '/site/combined', key: 'combined' },
  { to: '/site/pricing', key: 'pricing' },
  { to: '/site/features', key: 'features' },
  { to: '/site/about', key: 'about' },
];

function BrandMark({ size = 'h-8 w-8', textSize = 'text-base' }: { size?: string; textSize?: string }) {
  return (
    <Link to="/site" className="flex items-center gap-2">
      <div
        className={`flex ${size} flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-extrabold text-white shadow-sm`}
      >
        ق
      </div>
      <span className={`${textSize} font-extrabold tracking-tight text-slate-900`}>قيّدها</span>
    </Link>
  );
}

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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-white/90 backdrop-blur transition-shadow duration-200 ${
        scrolled ? 'border-slate-200 shadow-sm' : 'border-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <BrandMark />

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/site'}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-brand-700 active:scale-[0.96]"
          >
            {t('nav.startTrial')}
          </Link>
        </div>

        <button
          className="rounded-lg border border-slate-200 p-2 lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="menu"
          aria-expanded={mobileOpen}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
            {mobileOpen ? (
              <path strokeLinecap="round" d="M5 5l10 10M15 5 5 15" />
            ) : (
              <path strokeLinecap="round" d="M3 5h14M3 10h14M3 15h14" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/site'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
                  }`
                }
              >
                {t(`nav.${link.key}`)}
              </NavLink>
            ))}
            <div className="mt-2 flex items-center justify-between px-1">
              <SiteLanguageSwitcher />
              <Link to="/login" className="text-sm font-medium text-slate-600">
                {t('nav.login')}
              </Link>
            </div>
            <Link
              to="/register"
              className="mt-1 rounded-lg bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
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
    <footer className="border-t border-slate-200 bg-slate-950 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-extrabold text-white">
              ق
            </div>
            <span className="text-base font-extrabold text-white">قيّدها</span>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-slate-400">{t('footer.tagline')}</p>
          <div className="mt-5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <IconShield className="h-4 w-4 text-brand-400" />
            {t('footer.zatcaBadge')}
          </div>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold text-white">{t('footer.product')}</div>
          <ul className="space-y-2.5 text-sm text-slate-400">
            <li>
              <Link to="/site/pricing" className="transition-colors hover:text-white">
                {t('nav.pricing')}
              </Link>
            </li>
            <li>
              <Link to="/site/features" className="transition-colors hover:text-white">
                {t('nav.features')}
              </Link>
            </li>
            <li>
              <Link to="/site/qeedha-b" className="transition-colors hover:text-white">
                {t('nav.qeedhaB')}
              </Link>
            </li>
            <li>
              <Link to="/site/qeedha" className="transition-colors hover:text-white">
                {t('nav.qeedha')}
              </Link>
            </li>
            <li>
              <Link to="/site/affiliate" className="transition-colors hover:text-white">
                {t('nav.affiliate')}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold text-white">{t('footer.company')}</div>
          <ul className="space-y-2.5 text-sm text-slate-400">
            <li>
              <Link to="/site/about" className="transition-colors hover:text-white">
                {t('nav.about')}
              </Link>
            </li>
            <li>
              <Link to="/site/contact" className="transition-colors hover:text-white">
                {t('nav.contact')}
              </Link>
            </li>
            <li>
              <Link to="/site/faq" className="transition-colors hover:text-white">
                {t('nav.faq')}
              </Link>
            </li>
            <li>
              <Link to="/site/join-us" className="transition-colors hover:text-white">
                {t('nav.joinUs')}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold text-white">{t('footer.legal')}</div>
          <ul className="space-y-2.5 text-sm text-slate-400">
            <li>
              <Link to="/site/terms" className="transition-colors hover:text-white">
                {t('footer.terms')}
              </Link>
            </li>
            <li>
              <Link to="/site/privacy" className="transition-colors hover:text-white">
                {t('footer.privacy')}
              </Link>
            </li>
            <li>
              <Link to="/login" className="transition-colors hover:text-white">
                {t('nav.login')}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-slate-500">
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
