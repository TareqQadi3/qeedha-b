import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Select } from '../../components/ui';
import { PageHero, IconArrowStart, IconCheck } from '../components';

interface Plan {
  code: string;
  name: string;
  description: string | null;
  priceMonthlySar: string | null;
  priceAnnualSar: string | null;
  products: string[];
  isRecommended: boolean;
}

interface Market {
  code: string;
  nameAr: string;
  nameEn: string;
}

const PRODUCT_LABEL_KEYS: Record<string, string> = {
  qeedha_b: 'nav.qeedhaB',
  qeedha: 'nav.qeedha',
};

/** Public pricing page - reads Plan/Market straight from the Website phase's public endpoints, never hardcoded (spec "do not hardcode prices in frontend"). */
export function PricingPage() {
  const { t, i18n } = useTranslation('site');
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [country, setCountry] = useState('SA');
  const [error, setError] = useState(false);
  const [annual, setAnnual] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/website/plans'), api.get('/website/markets')])
      .then(([p, m]) => {
        setPlans(p);
        setMarkets(m);
      })
      .catch(() => setError(true));
  }, []);

  const hasAnyAnnual = useMemo(() => plans?.some((p) => p.priceAnnualSar) ?? false, [plans]);

  return (
    <div>
      <PageHero eyebrow={t('pricing.eyebrow')} title={t('pricing.title')} subtitle={t('pricing.subtitle')} />

      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
          {markets.length > 0 && (
            <div className="w-full max-w-[220px]">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('pricing.countryLabel')}</label>
              <Select value={country} onChange={(e) => setCountry(e.target.value)}>
                {markets.map((m) => (
                  <option key={m.code} value={m.code}>
                    {i18n.language === 'ar' ? m.nameAr : m.nameEn}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {hasAnyAnnual && (
            <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setAnnual(false)}
                aria-pressed={!annual}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  !annual ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('pricing.monthly')}
              </button>
              <button
                type="button"
                onClick={() => setAnnual(true)}
                aria-pressed={annual}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  annual ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('pricing.annually')}
              </button>
            </div>
          )}
        </div>

        {error && <p className="mt-10 text-center text-sm text-red-600">{t('pricing.loadError')}</p>}
        {!plans && !error && <p className="mt-10 text-center text-sm text-slate-400">{t('pricing.loading')}</p>}

        {plans && (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const showAnnual = annual && plan.priceAnnualSar;
              const price = showAnnual ? plan.priceAnnualSar : plan.priceMonthlySar;
              return (
                <div
                  key={plan.code}
                  className={`relative flex flex-col rounded-2xl bg-white p-6 shadow-card ring-1 transition-shadow hover:shadow-popover ${
                    plan.isRecommended ? 'ring-2 ring-brand-500' : 'ring-slate-200'
                  }`}
                >
                  {plan.isRecommended && (
                    <span className="absolute -top-3 start-6 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
                      {t('pricing.recommended')}
                    </span>
                  )}
                  <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
                  {plan.description && <p className="mt-1.5 text-sm text-slate-500">{plan.description}</p>}
                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold tabular-nums text-slate-900">{price ?? '—'}</span>
                    <span className="text-sm text-slate-500">
                      {showAnnual ? t('pricing.perYear') : t('pricing.perMonth')}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {plan.products.map((p) => {
                      const labelKey = PRODUCT_LABEL_KEYS[p];
                      return (
                        <span
                          key={p}
                          className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"
                        >
                          <IconCheck className="h-3 w-3" />
                          {labelKey ? t(labelKey) : p}
                        </span>
                      );
                    })}
                  </div>
                  <Link
                    to={`/register?plan=${plan.code}&country=${country}`}
                    className={`mt-6 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${
                      plan.isRecommended ? 'bg-brand-600 hover:bg-brand-700' : 'bg-slate-900 hover:bg-slate-800'
                    }`}
                  >
                    {t('pricing.startTrial')}
                    <IconArrowStart />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
