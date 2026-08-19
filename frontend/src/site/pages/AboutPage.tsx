import { useTranslation } from 'react-i18next';
import { SitePageContainer } from '../SiteLayout';

export function AboutPage() {
  const { t } = useTranslation('site');
  return (
    <SitePageContainer>
      <h1 className="text-3xl font-extrabold text-slate-900">{t('about.title')}</h1>
      <p className="mt-4 max-w-2xl text-slate-600">{t('about.body1')}</p>
      <p className="mt-3 max-w-2xl text-slate-600">{t('about.body2')}</p>
      <div className="mt-8 max-w-2xl rounded-xl border border-slate-200 p-5">
        <h2 className="mb-1.5 font-bold text-slate-900">{t('about.missionTitle')}</h2>
        <p className="text-sm text-slate-500">{t('about.missionBody')}</p>
      </div>
    </SitePageContainer>
  );
}
