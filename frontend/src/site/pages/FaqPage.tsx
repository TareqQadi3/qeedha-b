import { useTranslation } from 'react-i18next';
import { PageHero } from '../components';
import { SitePageContainer } from '../SiteLayout';

export function FaqPage() {
  const { t } = useTranslation('site');
  const items = t('faq.items', { returnObjects: true }) as { q: string; a: string }[];

  return (
    <div>
      <PageHero eyebrow={t('nav.faq')} title={t('faq.title')} />
      <SitePageContainer>
        <div className="mx-auto max-w-2xl space-y-3">
          {items.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm open:shadow-card"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                {item.q}
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  className="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-45"
                >
                  <path d="M10 4v12M4 10h12" />
                </svg>
              </summary>
              <p className="text-pretty mt-2.5 text-sm leading-relaxed text-slate-500">{item.a}</p>
            </details>
          ))}
        </div>
      </SitePageContainer>
    </div>
  );
}
