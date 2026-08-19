/**
 * Single source of truth for `Plan.products` entries (Website phase spec
 * "Packages/Commercial model"). Shared between the Control Center's
 * plan-editing DTOs (platform-admin/dto/plan.dto.ts) and
 * SubscriptionService.hasProduct/SubscriptionGuard - was previously a
 * locally-duplicated `const PRODUCT_KEYS` in plan.dto.ts only (Phase 9:
 * "reuse, don't duplicate").
 */
export const PRODUCT_KEYS = ['qeedha_b', 'qeedha'] as const;

export type PlanProductKey = (typeof PRODUCT_KEYS)[number];
