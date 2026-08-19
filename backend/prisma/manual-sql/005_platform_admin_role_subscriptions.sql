-- Manual, superuser-run DDL. NOT a Prisma migration - see
-- 001_auth_lookup_role.sql for why.
--
-- Follow-up to 004_platform_admin_role.sql: the Control Center Overview
-- (docs/WEBSITE.md "Control Center") needs merchant/subscription counts
-- by status and product across every tenant (trial/active/expired
-- counts, qeedha B vs qeedha vs combined subscriber counts) - the SAME
-- "no tenant context yet" problem 004 already solves for `companies`,
-- now extended to `subscriptions` (also FORCE ROW LEVEL SECURITY).
-- `plans` needs no grant here - it already carries no RLS at all (every
-- tenant/visitor may read the catalog, see schema.prisma).
--
-- Still the SAME single-purpose role as 004, not a wider one - only the
-- columns PlatformAdminService's overview/merchant-list queries actually
-- need.
--
-- Run once per environment by a DBA/deploy pipeline, after 004:
--   psql "$SUPERUSER_DATABASE_URL" -f prisma/manual-sql/005_platform_admin_role_subscriptions.sql

GRANT SELECT (id, company_id, plan_id, status, trial_ends_at, current_period_start, current_period_end, cancelled_at, created_at)
  ON "subscriptions" TO qeedha_platform_admin;
