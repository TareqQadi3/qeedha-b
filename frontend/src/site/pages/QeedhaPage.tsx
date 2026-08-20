import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHero, IconArrowStart, IconWallet } from '../components';
import { SitePageContainer } from '../SiteLayout';

/** qeedha (financing) is a separate product with its own backend, deliberately not merged with qeedha B - see docs/WEBSITE.md "Qeedha integration boundary". This page only markets it; no financing UI lives in this app. */
export function QeedhaPage() {
  const { t } = useTranslation('site');
  return (
    <div>
      <PageHero eyebrow={t('nav.qeedha')} title={t('qeedha.title')} subtitle={t('qeedha.subtitle')} />
      <SitePageContainer>
        <div className="mx-auto max-w-2xl text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-500 text-white shadow-sm">
            <IconWallet className="h-7 w-7" />
          </span>
          <div className="mt-6 rounded-2xl border border-accent-200 bg-accent-50 p-5 text-sm leading-relaxed text-accent-800">
            {t('qeedha.note')}
          </div>
          <Link
            to="/site/pricing"
            className="mt-8 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-accent-700 active:scale-[0.96]"
          >
            {t('qeedha.cta')}
            <IconArrowStart />
          </Link>
        </div>
      </SitePageContainer>
    </div>
  );
}
