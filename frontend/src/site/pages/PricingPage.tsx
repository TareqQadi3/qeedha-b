import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Badge, Select } from '../../components/ui';
import { SitePageContainer } from '../SiteLayout';

interface Plan {
  code: string;
  name: string;
  description: string | null;
  priceMonthlySar: string | null;
  products: string[];
  isRecommended: boolean;
}

interface Market {
  code: string;
  nameAr: string;
  nameEn: string;
}

/** Public pricing page - reads Plan/Market straight from the Website phase's public endpoints, never hardcoded (spec "do not hardcode prices in frontend"). */
export function PricingPage() {
  const { t, i18n } = useTranslation('site');
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [country, setCountry] = useState('SA');
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/website/plans'), api.get('/website/markets')])
      .then(([p, m]) => {
        setPlans(p);
        setMarkets(m);
      })
      .catch(() => setError(true));
  }, []);

  return (
    <SitePageContainer>
      <div className="text-center">
        <h1 className="text-3xl font-extrabold text-slate-900">{t('pricing.title')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-500">{t('pricing.subtitle')}</p>
      </div>

      {markets.length > 0 && (
        <div className="mx-auto mt-6 max-w-xs">
          <label className="mb-1.5 block text-center text-sm font-medium text-slate-700">{t('pricing.countryLabel')}</label>
          <Select value={country} onChange={(e) => setCountry(e.target.value)}>
            {markets.map((m) => (
              <option key={m.code} value={m.code}>
                {i18n.language === 'ar' ? m.nameAr : m.nameEn}
              </option>
            ))}
          </Select>
        </div>
      )}

      {error && <p className="mt-10 text-center text-sm text-red-600">{t('pricing.loadError')}</p>}
      {!plans && !error && <p className="mt-10 text-center text-sm text-slate-400">{t('pricing.loading')}</p>}

      {plans && (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.code}
              className={`relative rounded-2xl border p-6 shadow-card ${
                plan.isRecommended ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200'
              }`}
            >
              {plan.isRecommended && (
                <Badge variant="brand" className="absolute -top-3 start-6">
                  {t('pricing.recommended')}
                </Badge>
              )}
              <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
              {plan.description && <p className="mt-1 text-sm text-slate-500">{plan.description}</p>}
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-slate-900">{plan.priceMonthlySar ?? '—'}</span>
                <span className="text-sm text-slate-500">{t('pricing.perMonth')}</span>
              </div>
              <div className="mt-2 flex gap-1.5">
                {plan.products.map((p) => (
                  <Badge key={p} variant="neutral">
                    {p}
                  </Badge>
                ))}
              </div>
              <Link
                to={`/register?plan=${plan.code}&country=${country}`}
                className="mt-6 block rounded-lg bg-brand-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-700"
              >
                {t('pricing.startTrial')}
              </Link>
            </div>
          ))}
        </div>
      )}
    </SitePageContainer>
  );
}
