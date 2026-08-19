import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import arCommon from './locales/ar/common.json';
import arNav from './locales/ar/nav.json';
import arAuth from './locales/ar/auth.json';
import arDashboard from './locales/ar/dashboard.json';
import arPos from './locales/ar/pos.json';
import arSales from './locales/ar/sales.json';
import arProducts from './locales/ar/products.json';
import arCatalog from './locales/ar/catalog.json';
import arInventory from './locales/ar/inventory.json';
import arParty from './locales/ar/party.json';
import arPurchases from './locales/ar/purchases.json';
import arImports from './locales/ar/imports.json';
import arExpenses from './locales/ar/expenses.json';
import arAccounting from './locales/ar/accounting.json';
import arReports from './locales/ar/reports.json';
import arReceivablesPayables from './locales/ar/receivablesPayables.json';
import arSubscription from './locales/ar/subscription.json';
import arIntegration from './locales/ar/integration.json';
import arOnboarding from './locales/ar/onboarding.json';
import arTeam from './locales/ar/team.json';

import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enAuth from './locales/en/auth.json';
import enDashboard from './locales/en/dashboard.json';
import enPos from './locales/en/pos.json';
import enSales from './locales/en/sales.json';
import enProducts from './locales/en/products.json';
import enCatalog from './locales/en/catalog.json';
import enInventory from './locales/en/inventory.json';
import enParty from './locales/en/party.json';
import enPurchases from './locales/en/purchases.json';
import enImports from './locales/en/imports.json';
import enExpenses from './locales/en/expenses.json';
import enAccounting from './locales/en/accounting.json';
import enReports from './locales/en/reports.json';
import enReceivablesPayables from './locales/en/receivablesPayables.json';
import enSubscription from './locales/en/subscription.json';
import enIntegration from './locales/en/integration.json';
import enOnboarding from './locales/en/onboarding.json';
import enTeam from './locales/en/team.json';

export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
const LANGUAGE_STORAGE_KEY = 'qeedha_language';

// Arabic-first by design (this is the primary language the product was
// built for) - English is an explicit opt-in via the language switcher,
// never auto-selected from navigator.language. That also keeps every
// existing test's Arabic-text queries valid without a language stub.
function detectInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === 'en' ? 'en' : 'ar';
}

i18n.use(initReactI18next).init({
  resources: {
    ar: {
      common: arCommon,
      nav: arNav,
      auth: arAuth,
      dashboard: arDashboard,
      pos: arPos,
      sales: arSales,
      products: arProducts,
      catalog: arCatalog,
      inventory: arInventory,
      party: arParty,
      purchases: arPurchases,
      imports: arImports,
      expenses: arExpenses,
      accounting: arAccounting,
      reports: arReports,
      receivablesPayables: arReceivablesPayables,
      subscription: arSubscription,
      integration: arIntegration,
      onboarding: arOnboarding,
      team: arTeam,
    },
    en: {
      common: enCommon,
      nav: enNav,
      auth: enAuth,
      dashboard: enDashboard,
      pos: enPos,
      sales: enSales,
      products: enProducts,
      catalog: enCatalog,
      inventory: enInventory,
      party: enParty,
      purchases: enPurchases,
      imports: enImports,
      expenses: enExpenses,
      accounting: enAccounting,
      reports: enReports,
      receivablesPayables: enReceivablesPayables,
      subscription: enSubscription,
      integration: enIntegration,
      onboarding: enOnboarding,
      team: enTeam,
    },
  },
  ns: [
    'common',
    'nav',
    'auth',
    'dashboard',
    'pos',
    'sales',
    'products',
    'catalog',
    'inventory',
    'party',
    'purchases',
    'imports',
    'expenses',
    'accounting',
    'reports',
    'receivablesPayables',
    'subscription',
    'integration',
    'onboarding',
    'team',
  ],
  defaultNS: 'common',
  lng: detectInitialLanguage(),
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

export function applyDocumentDirection(language: string) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
}

export function setLanguage(language: SupportedLanguage) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  i18n.changeLanguage(language);
}

applyDocumentDirection(i18n.language);
i18n.on('languageChanged', applyDocumentDirection);

export default i18n;
