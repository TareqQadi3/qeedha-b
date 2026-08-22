-- Follow-up to 001/002/003_auth_lookup_role*.sql for Phase 12
-- (subscription number owner-login + employee login).
--
-- Same "auth bootstrap" problem as before: resolving a company by its
-- subscription_number, listing its branches, and finding its Owner
-- membership must all happen BEFORE any tenant context exists (that's
-- exactly what these lookups are for) - but "companies", "branches",
-- "memberships", "membership_roles" and "roles" all carry FORCE ROW LEVEL
-- SECURITY, so the normal app role cannot read them without app.tenant_id
-- already set. Reuses the same narrow, single-purpose `qeedha_auth_lookup`
-- role (see AuthLookupPrismaService/AuthLookupService) rather than
-- inventing a second bootstrap mechanism.
--
-- Run once per environment by a DBA/deploy pipeline, after 001-003:
--   psql "$SUPERUSER_DATABASE_URL" -f prisma/manual-sql/007_auth_lookup_role_phase12.sql

GRANT SELECT (subscription_number) ON "companies" TO qeedha_auth_lookup;

GRANT SELECT (id, company_id, name, code, is_default, deleted_at) ON "branches" TO qeedha_auth_lookup;

GRANT SELECT (id, company_id, membership_id, role_id, branch_id) ON "membership_roles" TO qeedha_auth_lookup;

GRANT SELECT (id, name, company_id) ON "roles" TO qeedha_auth_lookup;
