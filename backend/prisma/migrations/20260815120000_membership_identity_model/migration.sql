-- Identity/RBAC refactor: separate global User identity from per-company
-- Membership, and move role assignment from the user to the membership.
-- See docs/DOMAIN_MODEL.md for the full model and rationale.
--
-- DATA SAFETY: this migration is written to PRESERVE existing rows, not
-- reset the database. Phase 1 had "one user = one company" (users.company_id
-- NOT NULL), so every existing user maps to exactly one new Membership with
-- no ambiguity - the backfill below is lossless for that shape of data.
--
-- ORDERING NOTE: `prisma migrate deploy` runs as the app's own DB role
-- (qeedha_dev), which is subject to Phase 1's FORCE ROW LEVEL SECURITY on
-- "users" and "user_roles" (policy: company_id = current_setting(
-- 'app.tenant_id')). No tenant_id is set during a migration run, so until
-- those policies are removed, any SELECT against those tables silently
-- returns ZERO rows to this role (RLS filters rows, it doesn't error) -
-- not a query failure, just quietly wrong data. So RLS must be dropped from
-- both tables *first*, before either backfill reads from them.

-- 0) Remove RLS from the two tables we're about to read for backfill.
DROP POLICY IF EXISTS "tenant_isolation" ON "users";
ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "user_roles";
ALTER TABLE "user_roles" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" DISABLE ROW LEVEL SECURITY;

-- 1) memberships: the new User<->Company relationship.
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'suspended');

CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "memberships_company_id_user_id_key" ON "memberships"("company_id", "user_id");
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- Backfill: Phase 1 had exactly one company per user, so this is a direct,
-- lossless 1:1 copy - every existing user becomes a member of their company.
INSERT INTO "memberships" ("id", "company_id", "user_id", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), "company_id", "id", 'active', "created_at", "updated_at"
FROM "users";

-- 2) membership_roles: replaces user_roles, keyed by membership_id instead
--    of user_id (a role assignment belongs to "this user in this company").
CREATE TABLE "membership_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "branch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "membership_roles_membership_id_role_id_branch_id_key"
  ON "membership_roles"("membership_id", "role_id", "branch_id");
CREATE INDEX "membership_roles_company_id_membership_id_idx" ON "membership_roles"("company_id", "membership_id");

-- Backfill from user_roles via the membership we just created for that
-- (user_id, company_id) pair - lossless, same 1:1 reasoning as above.
INSERT INTO "membership_roles" ("id", "company_id", "membership_id", "role_id", "branch_id", "created_at")
SELECT ur."id", ur."company_id", m."id", ur."role_id", ur."branch_id", ur."created_at"
FROM "user_roles" ur
JOIN "memberships" m ON m."user_id" = ur."user_id" AND m."company_id" = ur."company_id";

-- 3) refresh_tokens gains membership_id (a session is scoped to one already-
--    selected tenant). Backfill from the membership matching the token's
--    existing (user_id, company_id), then enforce NOT NULL. refresh_tokens
--    was never RLS-protected, so no policy work needed here.
ALTER TABLE "refresh_tokens" ADD COLUMN "membership_id" UUID;

UPDATE "refresh_tokens" rt
SET "membership_id" = m."id"
FROM "memberships" m
WHERE m."user_id" = rt."user_id" AND m."company_id" = rt."company_id";

ALTER TABLE "refresh_tokens" ALTER COLUMN "membership_id" SET NOT NULL;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Drop the superseded user-level structures now that everything has been
--    copied forward.
DROP TABLE "user_roles";

ALTER TABLE "users" DROP CONSTRAINT "users_company_id_fkey";
DROP INDEX "users_company_id_deleted_at_idx";
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
ALTER TABLE "users" DROP COLUMN "company_id";

-- 5) RLS on the two new tenant-owned tables, same FORCE pattern as the rest
--    of the schema (see original row_level_security migration).
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "memberships"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "membership_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "membership_roles"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);
