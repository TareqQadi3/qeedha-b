/**
 * Single source of truth for plan feature entitlement keys (docs/DOMAIN_MODEL.md
 * "SaaS / Subscription" "Entitlements"). Every `Plan.features` JSON value is
 * keyed by one of these; `@RequireFeature(...)` decorates a route with one of
 * these; `SubscriptionGuard` checks a route's required key against the
 * company's current plan. Adding a new gated feature means adding a key here
 * and to every seed plan's `features` map - never a hardcoded
 * `if (plan.code === '...')` in a controller/service (Milestone 8 spec
 * section 5/11).
 *
 * This is deliberately a small set mapping to the existing named features
 * from Milestone 8's scope (section 12) - not every module in the app. A
 * module not listed here (Catalog, Customers/Suppliers, Purchases, Expenses,
 * IAM/Tenancy) is not plan-gated: it is core account management, available
 * to every plan. ZATCA Phase 1 (e-invoice QR) is mapped to a key here for
 * documentation/future-plan-design purposes but is NOT enforced at a route
 * (it is an automatic compliance step embedded in SalesService.createSale,
 * not a separate merchant-triggered action) - every seed plan enables it.
 */
export const FEATURE_KEYS = {
  POS: 'pos',
  INVENTORY: 'inventory',
  ACCOUNTING: 'accounting',
  REPORTS: 'reports',
  EXCEL_IMPORT: 'excel_import',
  ZATCA: 'zatca',
  AR_AP: 'ar_ap',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FEATURE_KEYS);

/** Human-readable Arabic labels, used by the merchant-facing subscription API/UI. */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  [FEATURE_KEYS.POS]: 'نقطة البيع',
  [FEATURE_KEYS.INVENTORY]: 'إدارة المخزون',
  [FEATURE_KEYS.ACCOUNTING]: 'الحسابات والقيود',
  [FEATURE_KEYS.REPORTS]: 'التقارير المحاسبية',
  [FEATURE_KEYS.EXCEL_IMPORT]: 'الاستيراد من Excel',
  [FEATURE_KEYS.ZATCA]: 'الفوترة الإلكترونية (زاتكا - المرحلة الأولى)',
  [FEATURE_KEYS.AR_AP]: 'الذمم المدينة والدائنة',
};
