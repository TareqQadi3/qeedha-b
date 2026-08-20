import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DecorativeGlow,
  Eyebrow,
  FeatureItem,
  HeroMockup,
  IconArrowStart,
  IconClock,
  IconCloud,
  IconGlobe,
  IconHeadset,
  IconLedger,
  IconShield,
  IconWallet,
  ProductCard,
  SectionHeading,
  StatPill,
  TrustChip,
} from '../components';

export function HomePage() {
  const { t } = useTranslation('site');

  const whyItems = [
    { icon: <IconShield />, title: t('home.why1Title'), desc: t('home.why1Desc'), tone: 'brand' as const },
    { icon: <IconGlobe />, title: t('home.why2Title'), desc: t('home.why2Desc'), tone: 'accent' as const },
    { icon: <IconClock />, title: t('home.why3Title'), desc: t('home.why3Desc'), tone: 'violet' as const },
    { icon: <IconHeadset />, title: t('home.why4Title'), desc: t('home.why4Desc'), tone: 'brand' as const },
    { icon: <IconCloud />, title: t('home.why5Title'), desc: t('home.why5Desc'), tone: 'accent' as const },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 pb-28 pt-14 text-white sm:pb-32 sm:pt-20">
        <DecorativeGlow />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-2">
          <div className="text-center lg:text-start">
            <Eyebrow>{t('home.heroEyebrow')}</Eyebrow>
            <h1 className="text-balance mt-5 text-3xl font-extrabold leading-[1.15] sm:text-5xl">
              {t('home.heroTitle')}
            </h1>
            <p className="text-pretty mx-auto mt-5 max-w-xl text-white/75 lg:mx-0">{t('home.heroSubtitle')}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link
                to="/register"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-800 shadow-sm transition-[background-color,transform] duration-150 hover:bg-brand-50 active:scale-[0.96]"
              >
                {t('home.ctaPrimary')}
                <IconArrowStart />
              </Link>
              <Link
                to="/site/pricing"
                className="rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                {t('home.ctaSecondary')}
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
              <TrustChip icon={<IconClock className="h-4 w-4" />}>{t('home.trustTrial')}</TrustChip>
              <TrustChip icon={<IconShield className="h-4 w-4" />}>{t('home.trustSecure')}</TrustChip>
              <TrustChip icon={<IconLedger className="h-4 w-4" />}>{t('home.trustZatca')}</TrustChip>
            </div>
          </div>
          <HeroMockup />
        </div>
      </section>

      {/* Trust / stats strip - overlaps hero bottom edge */}
      <section className="relative mx-auto -mt-14 max-w-5xl px-4 sm:-mt-16">
        <div className="grid grid-cols-2 divide-y divide-slate-100 rounded-2xl bg-white p-2 shadow-popover ring-1 ring-slate-900/5 sm:grid-cols-4 sm:divide-x sm:divide-y-0 sm:rtl:divide-x-reverse">
          <StatPill icon={<IconClock className="h-5 w-5" />} value="14" label={t('home.stat1Label')} />
          <StatPill icon={<IconShield className="h-5 w-5" />} value="ZATCA" label={t('home.stat2Label')} />
          <StatPill icon={<IconGlobe className="h-5 w-5" />} value="AR / EN" label={t('home.stat3Label')} />
          <StatPill icon={<IconHeadset className="h-5 w-5" />} value="✓" label={t('home.stat4Label')} />
        </div>
      </section>

      {/* Products */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:py-24">
        <SectionHeading eyebrow={t('home.productsEyebrow')} title={t('home.productsTitle')} />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <ProductCard
            tone="violet"
            featured
            badge={t('home.combinedBadge')}
            icon={<IconLedger className="h-6 w-6" />}
            title={t('home.combinedTitle')}
            desc={t('home.combinedDesc')}
            points={[t('combined.point1'), t('combined.point2'), t('combined.point3')]}
            href="/site/combined"
            cta={t('combined.cta')}
          />
          <ProductCard
            tone="brand"
            icon={<IconLedger className="h-6 w-6" />}
            title={t('home.qeedhaBTitle')}
            desc={t('home.qeedhaBDesc')}
            points={[t('qeedhaB.f1'), t('qeedhaB.f3'), t('qeedhaB.f4')]}
            href="/site/qeedha-b"
            cta={t('qeedhaB.cta')}
          />
          <ProductCard
            tone="accent"
            icon={<IconWallet className="h-6 w-6" />}
            title={t('home.qeedhaTitle')}
            desc={t('home.qeedhaDesc')}
            points={[t('qeedha.note')]}
            href="/site/qeedha"
            cta={t('qeedha.cta')}
          />
        </div>
      </section>

      {/* Why Qeedha */}
      <section className="bg-slate-50 px-4 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow={t('home.whyEyebrow')} title={t('home.whyTitle')} />
          <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
            {whyItems.map((item) => (
              <FeatureItem key={item.title} icon={item.icon} title={item.title} desc={item.desc} tone={item.tone} />
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 py-20 sm:py-24">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 to-brand-700 px-6 py-14 text-center text-white sm:px-14">
          <DecorativeGlow />
          <div className="relative">
            <h2 className="text-balance text-2xl font-extrabold sm:text-3xl">{t('home.ctaBottomTitle')}</h2>
            <p className="text-pretty mx-auto mt-3 max-w-md text-white/75">{t('home.ctaBottomSubtitle')}</p>
            <Link
              to="/register"
              className="mt-7 inline-flex items-center gap-1.5 rounded-lg bg-white px-7 py-3 text-sm font-semibold text-brand-800 shadow-sm transition-[background-color,transform] duration-150 hover:bg-brand-50 active:scale-[0.96]"
            >
              {t('home.ctaPrimary')}
              <IconArrowStart />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
