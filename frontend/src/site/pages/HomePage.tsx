import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui';

export function HomePage() {
  const { t } = useTranslation('site');

  const whyItems = [
    { title: t('home.why1Title'), desc: t('home.why1Desc') },
    { title: t('home.why2Title'), desc: t('home.why2Desc') },
    { title: t('home.why3Title'), desc: t('home.why3Desc') },
  ];

  return (
    <div>
      <section className="bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 px-4 py-20 text-center text-white">
        <div className="mx-auto max-w-3xl">
          <span className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
            {t('home.heroEyebrow')}
          </span>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">{t('home.heroTitle')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-white/80">{t('home.heroSubtitle')}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-800 shadow-sm hover:bg-brand-50"
            >
              {t('home.ctaPrimary')}
            </Link>
            <Link
              to="/site/pricing"
              className="rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              {t('home.ctaSecondary')}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="mb-8 text-center text-2xl font-extrabold text-slate-900">{t('home.productsTitle')}</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          <Card>
            <h3 className="mb-2 text-lg font-bold text-slate-900">{t('home.qeedhaBTitle')}</h3>
            <p className="text-sm text-slate-500">{t('home.qeedhaBDesc')}</p>
            <Link to="/site/qeedha-b" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
              {t('nav.qeedhaB')} ←
            </Link>
          </Card>
          <Card>
            <h3 className="mb-2 text-lg font-bold text-slate-900">{t('home.qeedhaTitle')}</h3>
            <p className="text-sm text-slate-500">{t('home.qeedhaDesc')}</p>
            <Link to="/site/qeedha" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
              {t('nav.qeedha')} ←
            </Link>
          </Card>
          <Card>
            <h3 className="mb-2 text-lg font-bold text-slate-900">{t('home.combinedTitle')}</h3>
            <p className="text-sm text-slate-500">{t('home.combinedDesc')}</p>
            <Link to="/site/combined" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
              {t('nav.combined')} ←
            </Link>
          </Card>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-2xl font-extrabold text-slate-900">{t('home.whyTitle')}</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {whyItems.map((item) => (
              <div key={item.title} className="text-center">
                <h3 className="mb-1.5 font-bold text-slate-900">{item.title}</h3>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 text-center">
        <h2 className="mb-2 text-2xl font-extrabold text-slate-900">{t('home.ctaBottomTitle')}</h2>
        <p className="mb-6 text-sm text-slate-500">{t('home.ctaBottomSubtitle')}</p>
        <Link
          to="/register"
          className="inline-block rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          {t('home.ctaPrimary')}
        </Link>
      </section>
    </div>
  );
}
