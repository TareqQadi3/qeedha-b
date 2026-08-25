-- Phase 13 ("تسعير الباقات بحسابات مفصّلة + إضافات لكل شركة").
--
-- All-nullable, purely additive columns - no data migration needed. NULL
-- on plans.max_* means "unlimited for that resource" (existing convention,
-- see plans.max_users/max_branches). NULL on subscriptions.*_override means
-- "use the plan's value" - a set override (including 0) always wins,
-- regardless of which plan the company is on. See
-- SubscriptionService.resourceUsage for how these combine.

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "max_accountants" INTEGER,
ADD COLUMN     "max_cashiers" INTEGER,
ADD COLUMN     "max_managers" INTEGER,
ADD COLUMN     "max_warehouses" INTEGER;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "accountants_override" INTEGER,
ADD COLUMN     "branches_override" INTEGER,
ADD COLUMN     "cashiers_override" INTEGER,
ADD COLUMN     "managers_override" INTEGER,
ADD COLUMN     "products_override" JSONB,
ADD COLUMN     "users_override" INTEGER,
ADD COLUMN     "warehouses_override" INTEGER;
