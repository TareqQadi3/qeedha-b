import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Presentational building blocks for the public marketing site only
 * (Phase 10 visual redesign). Deliberately separate from
 * `components/ui.tsx`, which is shared with the authenticated app/Control
 * Center - the marketing site's visual language (gradients, decorative
 * icons, hero treatments) has no business bleeding into dashboard UI.
 */

// ---------------------------------------------------------------------
// Icons - one inline SVG per concept, `currentColor` stroke, 1.75px to
// sit between the app's own 1.5 (body) and 2 (headings) conventions.
// ---------------------------------------------------------------------
const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function IconPos({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10.5h18M7.5 14.5h3" />
    </svg>
  );
}

export function IconLedger({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M6 3.5h9.5L19 7v13.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M15 3.5V7h4M8.5 11h7M8.5 14.5h7M8.5 18h4" />
    </svg>
  );
}

export function IconWallet({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h11a2 2 0 0 1 2 2v1M3.5 7.5v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-15Z" />
      <path d="M16 13.25h2.5" />
    </svg>
  );
}

export function IconShield({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M12 3.5 5 6v5.5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6l-7-2.5Z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  );
}

export function IconCloud({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M7 18.5h10.5a3.5 3.5 0 0 0 .5-6.96A5.5 5.5 0 0 0 7.35 9.5 4 4 0 0 0 7 18.5Z" />
    </svg>
  );
}

export function IconClock({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconGlobe({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.2 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.2-3.4-8.5s1.2-6.2 3.4-8.5Z" />
    </svg>
  );
}

export function IconSpark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.5l-1.6-5.3L5 10.6 10.4 9 12 3.5Z" />
    </svg>
  );
}

export function IconUsers({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.7-3 2.8-4.5 5.5-4.5s4.8 1.5 5.5 4.5" />
      <path d="M15.5 6a3 3 0 0 1 0 5.8M17.5 14.4c2 .5 3.3 1.9 4 4.6" />
    </svg>
  );
}

export function IconHeadset({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M4.5 13.5v-2a7.5 7.5 0 0 1 15 0v2" />
      <rect x="3.5" y="13" width="4" height="5.5" rx="1.5" />
      <rect x="16.5" y="13" width="4" height="5.5" rx="1.5" />
      <path d="M19 18.5a3.5 3.5 0 0 1-3.5 3.5h-2" />
    </svg>
  );
}

export function IconLayers({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5Z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16 12 20.5 20.5 16" />
    </svg>
  );
}

export function IconImport({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M12 3.5v10.5M8 10.5l4 4 4-4" />
      <path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function IconBranches({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <rect x="3.5" y="10" width="6" height="10.5" rx="1" />
      <rect x="14.5" y="6" width="6" height="14.5" rx="1" />
      <path d="M6.5 13.5h0M17.5 10h0M17.5 13.5h0" strokeWidth={2.5} />
    </svg>
  );
}

export function IconArrowStart({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...iconProps} strokeWidth={2} className={`rtl:-scale-x-100 ${className}`}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconCheck({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...iconProps} strokeWidth={2.25} className={className}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

// ---------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------

export function Eyebrow({
  children,
  tone = 'light',
}: {
  children: ReactNode;
  tone?: 'light' | 'dark';
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${
        tone === 'light' ? 'bg-white/10 text-white ring-1 ring-white/20' : 'bg-brand-50 text-brand-700'
      }`}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  center = true,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      {eyebrow && (
        <span className="mb-3 inline-block text-xs font-bold uppercase tracking-wider text-brand-600">{eyebrow}</span>
      )}
      <h2 className="text-balance text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      {subtitle && <p className="text-pretty mt-3 text-slate-500">{subtitle}</p>}
    </div>
  );
}

/** Compact gradient header used at the top of every inner page (pricing, features, about, ...) so the whole site shares one hero language instead of a plain white `<h1>`. */
export function PageHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 px-4 py-16 text-center text-white sm:py-20">
      <DecorativeGlow />
      <div className="relative mx-auto max-w-2xl">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="text-balance mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="text-pretty mx-auto mt-4 max-w-xl text-white/75">{subtitle}</p>}
      </div>
    </section>
  );
}

/** Soft radial glows behind dark hero sections - the only place this redesign uses heavy gradients, kept off every other section per the "avoid unnecessary gradients" brief. */
export function DecorativeGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-24 start-1/4 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl" />
      <div className="absolute -bottom-32 end-1/4 h-80 w-80 rounded-full bg-accent-500/10 blur-3xl" />
    </div>
  );
}

export function TrustChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-xs font-medium text-white ring-1 ring-white/15 backdrop-blur-sm sm:text-sm">
      <span className="text-white/80">{icon}</span>
      {children}
    </div>
  );
}

export function StatPill({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:justify-center">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        {icon}
      </span>
      <div className="text-start">
        <div className="text-lg font-extrabold tabular-nums text-slate-900">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

const ICON_TONES = {
  brand: 'bg-brand-50 text-brand-600',
  accent: 'bg-accent-50 text-accent-600',
  violet: 'bg-violet-50 text-violet-600',
} as const;

export function IconTile({
  icon,
  tone = 'brand',
  className = 'h-11 w-11',
}: {
  icon: ReactNode;
  tone?: keyof typeof ICON_TONES;
  className?: string;
}) {
  return (
    <span className={`flex flex-shrink-0 items-center justify-center rounded-xl ${ICON_TONES[tone]} ${className}`}>
      {icon}
    </span>
  );
}

export function FeatureItem({
  icon,
  title,
  desc,
  tone = 'brand',
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  tone?: keyof typeof ICON_TONES;
}) {
  return (
    <div className="flex flex-col items-center text-center sm:items-start sm:text-start">
      <IconTile icon={icon} tone={tone} />
      <h3 className="mt-4 font-bold text-slate-900">{title}</h3>
      <p className="text-pretty mt-1.5 text-sm leading-relaxed text-slate-500">{desc}</p>
    </div>
  );
}

const PRODUCT_TONES = {
  brand: {
    icon: 'bg-brand-600 text-white',
    ring: 'ring-brand-200 hover:ring-brand-300',
    bar: 'bg-brand-600',
    cta: 'bg-brand-600 hover:bg-brand-700',
    price: 'text-brand-700',
  },
  accent: {
    icon: 'bg-accent-500 text-white',
    ring: 'ring-accent-200 hover:ring-accent-300',
    bar: 'bg-accent-500',
    cta: 'bg-accent-600 hover:bg-accent-700',
    price: 'text-accent-700',
  },
  violet: {
    icon: 'bg-violet-600 text-white',
    ring: 'ring-violet-200 hover:ring-violet-300',
    bar: 'bg-violet-600',
    cta: 'bg-violet-600 hover:bg-violet-700',
    price: 'text-violet-700',
  },
} as const;

export function ProductCard({
  icon,
  tone,
  badge,
  title,
  desc,
  points,
  priceFrom,
  href,
  cta,
  featured = false,
}: {
  icon: ReactNode;
  tone: keyof typeof PRODUCT_TONES;
  badge?: string;
  title: string;
  desc: string;
  points: string[];
  priceFrom?: string;
  href: string;
  cta: string;
  featured?: boolean;
}) {
  const t = PRODUCT_TONES[tone];
  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 transition-all duration-200 hover:-translate-y-1 hover:shadow-popover ${t.ring} ${
        featured ? 'ring-2' : ''
      }`}
    >
      <span className={`absolute inset-x-0 top-0 h-1.5 ${t.bar}`} aria-hidden="true" />
      <div className="flex flex-1 flex-col p-6 pt-7">
        {badge && (
          <span
            className={`mb-4 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-bold text-white ${t.bar}`}
          >
            {badge}
          </span>
        )}
        <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${t.icon}`}>{icon}</span>
        <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
        <p className="text-pretty mt-1.5 text-sm leading-relaxed text-slate-500">{desc}</p>

        <ul className="mt-5 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm text-slate-700">
              <IconCheck className={`mt-0.5 h-4 w-4 flex-shrink-0 ${t.price}`} />
              <span>{p}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-6">
          {priceFrom && (
            <div className="mb-4 flex items-baseline gap-1.5">
              <span className="text-xs text-slate-400">from</span>
              <span className={`text-2xl font-extrabold tabular-nums ${t.price}`}>{priceFrom}</span>
            </div>
          )}
          <Link
            to={href}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${t.cta}`}
          >
            {cta}
            <IconArrowStart />
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Abstract dashboard illustration for the hero section. Deliberately not a
 * literal screenshot (none exists to embed, and fabricating fake sales
 * numbers/data as if real would be misleading) - a stylised browser-frame
 * mockup built from shapes, matching the "high-quality product visual"
 * brief without asserting specific business data.
 */
export function HeroMockup() {
  const { t } = useTranslation('site');
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-white/10 to-transparent blur-2xl" />
      <div className="rounded-2xl bg-white/95 p-3 shadow-popover ring-1 ring-white/20 backdrop-blur">
        <div className="flex items-center gap-1.5 px-1 pb-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[80px_minmax(0,1fr)]">
          <div className="hidden flex-col gap-2 sm:flex">
            <div className="h-8 rounded-lg bg-brand-600" />
            <div className="h-6 rounded-lg bg-white" />
            <div className="h-6 rounded-lg bg-white" />
            <div className="h-6 rounded-lg bg-white" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-2 rounded-lg bg-white p-3 shadow-sm">
              {[40, 65, 50, 80, 60, 90, 70].map((h, i) => (
                <span
                  key={i}
                  style={{ height: `${h}%`, maxHeight: 56 }}
                  className={`w-full rounded-t ${i === 5 ? 'bg-accent-500' : 'bg-brand-200'}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white p-2.5 shadow-sm">
                <div className="h-2 w-10 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-14 rounded bg-brand-600/80" />
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-sm">
                <div className="h-2 w-10 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-14 rounded bg-accent-500/80" />
              </div>
            </div>
            <div className="space-y-1.5 rounded-lg bg-white p-2.5 shadow-sm">
              {[100, 80, 90].map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-brand-300" />
                  <span style={{ width: `${w}%` }} className="h-2 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 -start-4 hidden rounded-xl bg-white px-3.5 py-2.5 shadow-popover ring-1 ring-slate-900/5 sm:flex sm:items-center sm:gap-2">
        <IconTile icon={<IconShield className="h-4 w-4" />} tone="brand" className="h-8 w-8 rounded-lg" />
        <div className="text-xs">
          <div className="font-bold text-slate-900">{t('home.mockup.zatcaTitle')}</div>
          <div className="text-slate-400">{t('home.mockup.zatcaSubtitle')}</div>
        </div>
      </div>
      <div className="absolute -end-3 -top-5 hidden rounded-xl bg-white px-3.5 py-2.5 shadow-popover ring-1 ring-slate-900/5 sm:flex sm:items-center sm:gap-2">
        <IconTile icon={<IconCloud className="h-4 w-4" />} tone="accent" className="h-8 w-8 rounded-lg" />
        <div className="text-xs">
          <div className="font-bold text-slate-900">{t('home.mockup.cloudTitle')}</div>
          <div className="text-slate-400">{t('home.mockup.cloudSubtitle')}</div>
        </div>
      </div>
    </div>
  );
}
