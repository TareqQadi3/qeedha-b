import { useTranslation } from 'react-i18next';
import { SitePageContainer } from '../SiteLayout';

export function PrivacyPage() {
  const { t } = useTranslation('site');
  return (
    <SitePageContainer>
      <h1 className="text-3xl font-extrabold text-slate-900">{t('privacy.title')}</h1>
      <p className="mt-1 text-xs text-slate-400">{t('privacy.updated')}</p>
      <p className="mt-6 max-w-2xl leading-relaxed text-slate-600">{t('privacy.body')}</p>
    </SitePageContainer>
  );
}
