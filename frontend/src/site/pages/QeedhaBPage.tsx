import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHero, IconArrowStart, IconCheck, IconLedger } from '../components';
import { SitePageContainer } from '../SiteLayout';

export function QeedhaBPage() {
  const { t } = useTranslation('site');
  const features = [t('qeedhaB.f1'), t('qeedhaB.f2'), t('qeedhaB.f3'), t('qeedhaB.f4'), t('qeedhaB.f5'), t('qeedhaB.f6')];

  return (
    <div>
      <PageHero eyebrow={t('nav.qeedhaB')} title={t('qeedhaB.title')} subtitle={t('qeedhaB.subtitle')} />
      <SitePageContainer>
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-center gap-3 sm:justify-start">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <IconLedger className="h-6 w-6" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">{t('qeedhaB.featuresTitle')}</h2>
          </div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm"
              >
                <IconCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600" />
                {f}
              </li>
            ))}
          </ul>

          <Link
            to="/site/pricing"
            className="mt-9 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-brand-700 active:scale-[0.96]"
          >
            {t('qeedhaB.cta')}
            <IconArrowStart />
          </Link>
        </div>
      </SitePageContainer>
    </div>
  );
}
