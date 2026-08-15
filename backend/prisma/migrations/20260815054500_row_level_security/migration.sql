-- Row-Level Security backstop for multi-tenancy.
-- App code already scopes every query by company_id via Prisma middleware;
-- this migration adds an independent database-level guarantee so that a
-- missed WHERE clause in the future cannot leak data across tenants.
--
-- The app connects using a non-superuser role that must have RLS forced on
-- (FORCE ROW LEVEL SECURITY), not just enabled, otherwise the table owner
-- bypasses RLS by default. Each request sets the tenant via:
--   SET LOCAL app.tenant_id = '<company-uuid>';
-- inside the request-scoped transaction. If unset, current_setting(...) is
-- NULL and every policy comparison evaluates to NULL (deny by default).

-- companies: a row can only see itself (used by cross-tenant admin tooling
-- separately, bypassing RLS with an explicit superuser/admin connection).
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "companies"
  USING (id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "branches"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warehouses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "warehouses"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "pos_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_devices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pos_devices"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

-- roles: company_id NULL rows are system-wide roles (Owner/Manager/Cashier/...)
-- visible to every tenant in addition to that tenant's own custom roles.
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "roles"
  USING (company_id IS NULL OR company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "user_roles"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "integration_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_connections" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "integration_connections"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

-- permissions and integration_providers are global catalog tables (no
-- company_id), intentionally readable by all tenants - no RLS needed.

-- refresh_tokens has no company_id (scoped via user_id -> users, which is
-- itself RLS-protected); it is only ever queried by user_id from within an
-- authenticated request, never listed cross-tenant.
