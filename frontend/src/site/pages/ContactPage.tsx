import { useTranslation } from 'react-i18next';
import { IconClock, PageHero } from '../components';
import { SitePageContainer } from '../SiteLayout';

const IconMail = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4.5 7 7.5 5.5L19.5 7" />
  </svg>
);

export function ContactPage() {
  const { t } = useTranslation('site');
  return (
    <div>
      <PageHero eyebrow={t('nav.contact')} title={t('contact.title')} subtitle={t('contact.subtitle')} />
      <SitePageContainer>
        <div className="mx-auto grid max-w-md gap-4">
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <IconMail />
            </span>
            <div>
              <div className="text-xs font-medium text-slate-500">{t('contact.emailLabel')}</div>
              <div className="font-medium text-slate-900" dir="ltr">
                {t('contact.email')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
              <IconClock />
            </span>
            <div>
              <div className="text-xs font-medium text-slate-500">{t('contact.hoursLabel')}</div>
              <div className="font-medium text-slate-900">{t('contact.hours')}</div>
            </div>
          </div>
        </div>
      </SitePageContainer>
    </div>
  );
}
