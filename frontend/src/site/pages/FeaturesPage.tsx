import { useTranslation } from 'react-i18next';
import { SitePageContainer } from '../SiteLayout';

export function FeaturesPage() {
  const { t } = useTranslation('site');
  const items = t('features.items', { returnObjects: true }) as { title: string; desc: string }[];

  return (
    <SitePageContainer>
      <div className="text-center">
        <h1 className="text-3xl font-extrabold text-slate-900">{t('features.title')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-500">{t('features.subtitle')}</p>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="rounded-xl border border-slate-200 p-5">
            <h3 className="mb-1.5 font-bold text-slate-900">{item.title}</h3>
            <p className="text-sm text-slate-500">{item.desc}</p>
          </div>
        ))}
      </div>
    </SitePageContainer>
  );
}
