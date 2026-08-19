import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SitePageContainer } from '../SiteLayout';

export function QeedhaBPage() {
  const { t } = useTranslation('site');
  const features = [t('qeedhaB.f1'), t('qeedhaB.f2'), t('qeedhaB.f3'), t('qeedhaB.f4'), t('qeedhaB.f5'), t('qeedhaB.f6')];

  return (
    <SitePageContainer>
      <h1 className="text-3xl font-extrabold text-slate-900">{t('qeedhaB.title')}</h1>
      <p className="mt-3 max-w-2xl text-slate-500">{t('qeedhaB.subtitle')}</p>

      <h2 className="mb-3 mt-10 text-lg font-bold text-slate-900">{t('qeedhaB.featuresTitle')}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <span className="mt-0.5 text-brand-600">✓</span>
            {f}
          </li>
        ))}
      </ul>

      <Link
        to="/site/pricing"
        className="mt-8 inline-block rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
      >
        {t('qeedhaB.cta')}
      </Link>
    </SitePageContainer>
  );
}
