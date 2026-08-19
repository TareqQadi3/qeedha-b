import { useTranslation } from 'react-i18next';
import { SitePageContainer } from '../SiteLayout';

export function ContactPage() {
  const { t } = useTranslation('site');
  return (
    <SitePageContainer>
      <h1 className="text-3xl font-extrabold text-slate-900">{t('contact.title')}</h1>
      <p className="mt-3 text-slate-500">{t('contact.subtitle')}</p>
      <div className="mt-8 max-w-md space-y-4">
        <div>
          <div className="text-xs font-medium text-slate-500">{t('contact.emailLabel')}</div>
          <div className="text-sm font-medium text-slate-900" dir="ltr">
            {t('contact.email')}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500">{t('contact.hoursLabel')}</div>
          <div className="text-sm font-medium text-slate-900">{t('contact.hours')}</div>
        </div>
      </div>
    </SitePageContainer>
  );
}
