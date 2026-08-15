-- Follow-up to 001_auth_lookup_role.sql after the Membership identity
-- refactor (see docs/DOMAIN_MODEL.md).
--
-- "users" is no longer tenant-owned data (no RLS at all, see the
-- membership_identity_model migration), so qeedha_auth_lookup no longer
-- needs a special bypass to read it - the normal app role can now query
-- users directly for the login credential check.
--
-- What qeedha_auth_lookup is needed for now: resolving which companies a
-- user can pick from *before* a tenant context exists, i.e. reading
-- "memberships" (RLS-protected, tenant-owned) and "companies" (also
-- RLS-protected) across all tenants for one specific user_id. Still the
-- same narrow, single-purpose role - just pointed at different tables.
--
-- Run once per environment by a DBA/deploy pipeline, after 001:
--   psql "$SUPERUSER_DATABASE_URL" -f prisma/manual-sql/002_auth_lookup_role_update.sql

REVOKE SELECT ON "users" FROM qeedha_auth_lookup;

GRANT SELECT (id, company_id, user_id, status) ON "memberships" TO qeedha_auth_lookup;
GRANT SELECT (id, legal_name, trade_name, status) ON "companies" TO qeedha_auth_lookup;
