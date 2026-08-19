import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SitePageContainer } from '../SiteLayout';

export function CombinedPage() {
  const { t } = useTranslation('site');
  const points = [t('combined.point1'), t('combined.point2'), t('combined.point3')];

  return (
    <SitePageContainer>
      <h1 className="text-3xl font-extrabold text-slate-900">{t('combined.title')}</h1>
      <p className="mt-3 max-w-2xl text-slate-500">{t('combined.subtitle')}</p>
      <ul className="mt-8 space-y-2.5">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-slate-700">
            <span className="mt-0.5 text-brand-600">✓</span>
            {p}
          </li>
        ))}
      </ul>
      <Link
        to="/site/pricing"
        className="mt-8 inline-block rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
      >
        {t('combined.cta')}
      </Link>
    </SitePageContainer>
  );
}
