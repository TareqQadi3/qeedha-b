-- Phase 12 ("رقم الاشتراك" + employee login).
--
-- 1. `companies.subscription_number`: a human-dictatable tenant identifier,
--    sequential and distinct from the internal uuid `id`. The sequence is
--    restarted at 10001 right after creation so the FIRST company (which
--    the ADD COLUMN backfill above already numbered from 1) - and every
--    company after it - lands on/after 10001, never colliding with the
--    backfilled low numbers. Existing companies keep whatever low number
--    the backfill gave them; this only matters for a fresh/dev/seed
--    database with few enough existing companies that 10001 is still safe
--    headroom, which is the case here.
--
-- 2. `users.username` moves from a platform-wide unique identifier to one
--    scoped to `home_company_id` (see schema.prisma User.homeCompanyId
--    comment) - this is the actual fix for "employee username collides
--    across unrelated companies" (two different companies can now both
--    have a "ahmed").
-- DropIndex
DROP INDEX "users_username_key";

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "subscription_number" SERIAL NOT NULL;

-- Restart the implicit SERIAL sequence so newly created companies start at
-- 10001 (see comment above) instead of continuing from wherever the
-- ADD COLUMN backfill left off.
ALTER SEQUENCE "companies_subscription_number_seq" RESTART WITH 10001;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "home_company_id" UUID;

-- Data backfill: every EXISTING username-bearing user predates
-- home_company_id and would otherwise land on NULL, which employee login
-- (AuthService.employeeLogin, filtering by home_company_id) would never
-- match - silently locking out every team member created before Phase 12.
-- Set it from their (earliest, if somehow more than one) Membership; the
-- old global @@unique([username]) already guarantees this backfill can
-- never itself create a (home_company_id, username) collision.
UPDATE "users" u
SET "home_company_id" = sub."company_id"
FROM (
  SELECT DISTINCT ON (m."user_id") m."user_id", m."company_id"
  FROM "memberships" m
  ORDER BY m."user_id", m."created_at" ASC
) sub
WHERE u.id = sub."user_id"
  AND u."username" IS NOT NULL
  AND u."home_company_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "companies_subscription_number_key" ON "companies"("subscription_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_home_company_id_username_key" ON "users"("home_company_id", "username");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_home_company_id_fkey" FOREIGN KEY ("home_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
