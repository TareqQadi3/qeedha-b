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
