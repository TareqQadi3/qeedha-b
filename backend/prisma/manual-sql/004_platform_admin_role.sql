-- Manual, superuser-run DDL. NOT a Prisma migration - see
-- 001_auth_lookup_role.sql for why this can't be a normal migration
-- (creating a role and granting BYPASSRLS both require superuser
-- privileges the app's own runtime role must never have).
--
-- Purpose: the SaaS admin control panel (docs/DOMAIN_MODEL.md "Platform
-- admin") needs to list companies ACROSS every tenant, which is
-- structurally the same "no tenant context yet" problem
-- qeedha_auth_lookup already solves for login - but deliberately a
-- SEPARATE role, not a wider grant on qeedha_auth_lookup: that role is
-- documented as single-purpose for the login-bootstrap path
-- (AuthLookupService), and letting an unrelated feature quietly widen its
-- blast radius is exactly the kind of privilege creep RLS is meant to
-- prevent. qeedha_platform_admin exists only for PlatformAdminService.
--
-- Run once per environment by a DBA/deploy pipeline:
--   psql "$SUPERUSER_DATABASE_URL" -f prisma/manual-sql/004_platform_admin_role.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'qeedha_platform_admin') THEN
    CREATE ROLE qeedha_platform_admin LOGIN PASSWORD 'qeedha_platform_admin_pw';
  END IF;
END
$$;

ALTER ROLE qeedha_platform_admin BYPASSRLS;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO qeedha_platform_admin', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO qeedha_platform_admin;

-- Read-only, and only the columns an admin list/detail view needs - never
-- financial or RBAC data. Creating a company still goes through the
-- normal app role/RLS machinery (PrismaService.withTenant with the new
-- company's own id - see AuthService.createCompanyWithOwner), so no
-- INSERT grant is needed here at all.
GRANT SELECT (id, legal_name, trade_name, vat_number, cr_number, status, created_at)
  ON "companies" TO qeedha_platform_admin;
