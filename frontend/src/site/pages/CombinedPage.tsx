import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHero, IconArrowStart, IconCheck, IconLayers } from '../components';
import { SitePageContainer } from '../SiteLayout';

export function CombinedPage() {
  const { t } = useTranslation('site');
  const points = [t('combined.point1'), t('combined.point2'), t('combined.point3')];

  return (
    <div>
      <PageHero eyebrow={t('nav.combined')} title={t('combined.title')} subtitle={t('combined.subtitle')} />
      <SitePageContainer>
        <div className="mx-auto max-w-2xl">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm">
            <IconLayers className="h-7 w-7" />
          </span>
          <ul className="mt-8 space-y-3">
            {points.map((p) => (
              <li
                key={p}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm"
              >
                <IconCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
                {p}
              </li>
            ))}
          </ul>
          <Link
            to="/site/pricing"
            className="mt-9 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-violet-700 active:scale-[0.96]"
          >
            {t('combined.cta')}
            <IconArrowStart />
          </Link>
        </div>
      </SitePageContainer>
    </div>
  );
}
