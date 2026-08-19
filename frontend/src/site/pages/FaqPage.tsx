import { useTranslation } from 'react-i18next';
import { SitePageContainer } from '../SiteLayout';

export function FaqPage() {
  const { t } = useTranslation('site');
  const items = t('faq.items', { returnObjects: true }) as { q: string; a: string }[];

  return (
    <SitePageContainer>
      <h1 className="text-3xl font-extrabold text-slate-900">{t('faq.title')}</h1>
      <div className="mt-8 max-w-2xl divide-y divide-slate-200 border-y border-slate-200">
        {items.map((item) => (
          <details key={item.q} className="group py-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">{item.q}</summary>
            <p className="mt-2 text-sm text-slate-500">{item.a}</p>
          </details>
        ))}
      </div>
    </SitePageContainer>
  );
}
