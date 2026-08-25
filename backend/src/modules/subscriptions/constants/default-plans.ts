import { Prisma } from '@prisma/client';
import { FEATURE_KEYS } from './feature-keys';

export interface PlanSeedDefinition {
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  trialEligible: boolean;
  /** SAR, placeholder/demo pricing only - see docs/DEMO.md "Subscription & Billing". null = "contact sales", not "free". */
  priceMonthlySar: number | null;
  billingInterval: 'monthly';
  maxUsers: number | null;
  maxBranches: number | null;
  maxMonthlySales: number | null;
  // Phase 13 - see the same-named Plan schema fields' comment.
  maxCashiers: number | null;
  maxAccountants: number | null;
  maxManagers: number | null;
  maxWarehouses: number | null;
  features: Record<string, boolean>;
}

/**
 * Centralized plan catalog seeded into the `plans` table (prisma/seed.ts) -
 * the single place plan pricing/limits/features are defined, per Milestone 8
 * spec section 5 ("Plan configuration should be centralized"). A future
 * Control Center can edit these rows directly without a code deploy; this
 * array only supplies the INITIAL values for `prisma db seed` (upsert by
 * `code`, so re-running seed never resets an admin's later edits - same
 * idempotent-upsert pattern as PERMISSIONS/SYSTEM_ROLES in iam/constants).
 *
 * Every registration is assigned PLAN_CODES.PROFESSIONAL in `trialing`
 * status (AuthService.registerCompany) - the most generous seed plan - so
 * the default/demo company and every existing e2e test scenario keeps
 * working unmodified (Milestone 8 spec sections 12/21/23: "must not break
 * the current default/demo environment", "do not reduce coverage"). STARTER
 * exists in the catalog to give the enforcement layer (feature gating, usage
 * limits) something real to demonstrate and test against.
 */
export const PLAN_CODES = {
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  // Phase 13: the real customer-facing tiers, defined by exact per-role
  // account counts (not just a total maxUsers) - see docs/DOMAIN_MODEL.md
  // "الباقات (Phase 13)". STARTER/PROFESSIONAL above are kept exactly as
  // they were (untouched values, still the internal registration default)
  // rather than repurposed, so nothing about the ~270 pre-existing e2e
  // tests that rely on their generous unrestricted limits changes.
  BASIC: 'basic',
  STANDARD: 'standard',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise',
} as const;

export const DEFAULT_PLANS: PlanSeedDefinition[] = [
  {
    code: PLAN_CODES.STARTER,
    name: 'الأساسية',
    description:
      'مناسبة لمتجر واحد صغير - نقطة بيع ومخزون وحسابات أساسية دون استيراد Excel أو الذمم.',
    isActive: true,
    trialEligible: true,
    priceMonthlySar: 99,
    billingInterval: 'monthly',
    maxUsers: 3,
    maxBranches: 1,
    maxMonthlySales: 200,
    maxCashiers: null,
    maxAccountants: null,
    maxManagers: null,
    maxWarehouses: null,
    features: {
      [FEATURE_KEYS.POS]: true,
      [FEATURE_KEYS.INVENTORY]: true,
      [FEATURE_KEYS.ACCOUNTING]: true,
      [FEATURE_KEYS.REPORTS]: true,
      [FEATURE_KEYS.EXCEL_IMPORT]: false,
      [FEATURE_KEYS.ZATCA]: true,
      [FEATURE_KEYS.AR_AP]: false,
    },
  },
  {
    code: PLAN_CODES.PROFESSIONAL,
    name: 'الاحترافية',
    description: 'لمنشأة متعددة الفروع - كل مزايا المنصة بحدود استخدام واسعة.',
    isActive: true,
    trialEligible: true,
    priceMonthlySar: 299,
    billingInterval: 'monthly',
    maxUsers: 15,
    maxBranches: 5,
    maxMonthlySales: 2000,
    maxCashiers: null,
    maxAccountants: null,
    maxManagers: null,
    maxWarehouses: null,
    features: {
      [FEATURE_KEYS.POS]: true,
      [FEATURE_KEYS.INVENTORY]: true,
      [FEATURE_KEYS.ACCOUNTING]: true,
      [FEATURE_KEYS.REPORTS]: true,
      [FEATURE_KEYS.EXCEL_IMPORT]: true,
      [FEATURE_KEYS.ZATCA]: true,
      [FEATURE_KEYS.AR_AP]: true,
    },
  },
  // Phase 13 tiers below. Every account count is per-role (Owner is always
  // exactly 1, created at registration - it never counts against any of
  // these, and isn't listed as a limit here). Prices left null ("تواصل مع
  // المبيعات") - set the real monthly price for each from the Control
  // Center's Plan editor once decided; nothing here blocks that.
  {
    code: PLAN_CODES.BASIC,
    name: 'الباقة الأولى',
    description: 'فرع واحد، حسابا نقطة بيع، ومحاسب واحد.',
    isActive: true,
    trialEligible: true,
    priceMonthlySar: null,
    billingInterval: 'monthly',
    maxUsers: null,
    maxBranches: 1,
    maxMonthlySales: null,
    maxCashiers: 2,
    maxAccountants: 1,
    maxManagers: 0,
    maxWarehouses: 1,
    features: {
      [FEATURE_KEYS.POS]: true,
      [FEATURE_KEYS.INVENTORY]: true,
      [FEATURE_KEYS.ACCOUNTING]: true,
      [FEATURE_KEYS.REPORTS]: true,
      [FEATURE_KEYS.EXCEL_IMPORT]: true,
      [FEATURE_KEYS.ZATCA]: true,
      [FEATURE_KEYS.AR_AP]: true,
    },
  },
  {
    code: PLAN_CODES.STANDARD,
    name: 'الباقة الثانية',
    description: 'فرعان، أربعة حسابات نقطة بيع، محاسب ومدير.',
    isActive: true,
    trialEligible: true,
    priceMonthlySar: null,
    billingInterval: 'monthly',
    maxUsers: null,
    maxBranches: 2,
    maxMonthlySales: null,
    maxCashiers: 4,
    maxAccountants: 1,
    maxManagers: 1,
    maxWarehouses: 1,
    features: {
      [FEATURE_KEYS.POS]: true,
      [FEATURE_KEYS.INVENTORY]: true,
      [FEATURE_KEYS.ACCOUNTING]: true,
      [FEATURE_KEYS.REPORTS]: true,
      [FEATURE_KEYS.EXCEL_IMPORT]: true,
      [FEATURE_KEYS.ZATCA]: true,
      [FEATURE_KEYS.AR_AP]: true,
    },
  },
  {
    code: PLAN_CODES.PREMIUM,
    name: 'الباقة الثالثة',
    description: 'ثلاثة فروع، ستة حسابات نقطة بيع، محاسب ومدير ومخزن إضافي.',
    isActive: true,
    trialEligible: true,
    priceMonthlySar: null,
    billingInterval: 'monthly',
    maxUsers: null,
    maxBranches: 3,
    maxMonthlySales: null,
    maxCashiers: 6,
    maxAccountants: 1,
    maxManagers: 1,
    maxWarehouses: 2,
    features: {
      [FEATURE_KEYS.POS]: true,
      [FEATURE_KEYS.INVENTORY]: true,
      [FEATURE_KEYS.ACCOUNTING]: true,
      [FEATURE_KEYS.REPORTS]: true,
      [FEATURE_KEYS.EXCEL_IMPORT]: true,
      [FEATURE_KEYS.ZATCA]: true,
      [FEATURE_KEYS.AR_AP]: true,
    },
  },
  {
    code: PLAN_CODES.ENTERPRISE,
    name: 'باقة المؤسسات',
    description:
      'للشركات والمتاجر متعددة الفروع - بلا حدود افتراضية؛ تُخصَّص حدود كل عميل فعليًا من لوحة تحكم منصة قيّدها (اشتراك هذا العميل).',
    isActive: true,
    trialEligible: true,
    priceMonthlySar: null,
    billingInterval: 'monthly',
    maxUsers: null,
    maxBranches: null,
    maxMonthlySales: null,
    maxCashiers: null,
    maxAccountants: null,
    maxManagers: null,
    maxWarehouses: null,
    features: {
      [FEATURE_KEYS.POS]: true,
      [FEATURE_KEYS.INVENTORY]: true,
      [FEATURE_KEYS.ACCOUNTING]: true,
      [FEATURE_KEYS.REPORTS]: true,
      [FEATURE_KEYS.EXCEL_IMPORT]: true,
      [FEATURE_KEYS.ZATCA]: true,
      [FEATURE_KEYS.AR_AP]: true,
    },
  },
];

export function planFeaturesJson(features: Record<string, boolean>): Prisma.InputJsonValue {
  return features as Prisma.InputJsonValue;
}
