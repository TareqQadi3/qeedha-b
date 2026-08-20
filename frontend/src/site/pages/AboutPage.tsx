import { useTranslation } from 'react-i18next';
import { IconSpark, PageHero } from '../components';
import { SitePageContainer } from '../SiteLayout';

export function AboutPage() {
  const { t } = useTranslation('site');
  return (
    <div>
      <PageHero eyebrow={t('nav.about')} title={t('about.title')} />
      <SitePageContainer>
        <div className="mx-auto max-w-2xl">
          <p className="text-pretty leading-relaxed text-slate-600">{t('about.body1')}</p>
          <p className="text-pretty mt-3 leading-relaxed text-slate-600">{t('about.body2')}</p>
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <IconSpark className="h-5 w-5" />
            </span>
            <h2 className="mt-3 font-bold text-slate-900">{t('about.missionTitle')}</h2>
            <p className="mt-1.5 text-sm text-slate-500">{t('about.missionBody')}</p>
          </div>
        </div>
      </SitePageContainer>
    </div>
  );
}
