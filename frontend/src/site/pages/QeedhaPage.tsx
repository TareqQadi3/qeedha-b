import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SitePageContainer } from '../SiteLayout';

/** qeedha (financing) is a separate product with its own backend, deliberately not merged with qeedha B - see docs/WEBSITE.md "Qeedha integration boundary". This page only markets it; no financing UI lives in this app. */
export function QeedhaPage() {
  const { t } = useTranslation('site');
  return (
    <SitePageContainer>
      <h1 className="text-3xl font-extrabold text-slate-900">{t('qeedha.title')}</h1>
      <p className="mt-3 max-w-2xl text-slate-500">{t('qeedha.subtitle')}</p>
      <div className="mt-6 max-w-2xl rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
        {t('qeedha.note')}
      </div>
      <Link
        to="/site/pricing"
        className="mt-8 inline-block rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
      >
        {t('qeedha.cta')}
      </Link>
    </SitePageContainer>
  );
}
