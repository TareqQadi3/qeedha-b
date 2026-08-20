import { useTranslation } from 'react-i18next';
import { PageHero } from '../components';
import { SitePageContainer } from '../SiteLayout';

export function TermsPage() {
  const { t } = useTranslation('site');
  return (
    <div>
      <PageHero eyebrow={t('footer.legal')} title={t('terms.title')} />
      <SitePageContainer>
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs text-slate-400">{t('terms.updated')}</p>
          <p className="text-pretty mt-4 leading-relaxed text-slate-600">{t('terms.body')}</p>
        </div>
      </SitePageContainer>
    </div>
  );
}
