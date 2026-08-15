-- Manual, superuser-run DDL. NOT a Prisma migration: creating roles and
-- granting BYPASSRLS requires superuser privileges that the application's
-- own runtime role (qeedha_dev / the production app role) must never have,
-- otherwise Row-Level Security stops being a real backstop for anything.
--
-- Purpose: solve the "login bootstrap" problem. Authenticating a user by
-- email/mobile must happen BEFORE we know which tenant they belong to, so
-- the normal RLS-forced app connection (which requires app.tenant_id to
-- already be set) cannot serve this one lookup. Instead, a second,
-- deliberately narrow role is used ONLY for this credential lookup, granted
-- SELECT on exactly the columns AuthLookupService needs and nothing else -
-- it cannot read any other table, and cannot write anything.
--
-- Run once per environment by a DBA/deploy pipeline:
--   psql "$SUPERUSER_DATABASE_URL" -f prisma/manual-sql/001_auth_lookup_role.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'qeedha_auth_lookup') THEN
    CREATE ROLE qeedha_auth_lookup LOGIN PASSWORD 'qeedha_auth_lookup_pw';
  END IF;
END
$$;

ALTER ROLE qeedha_auth_lookup BYPASSRLS;

GRANT CONNECT ON DATABASE qeedha_accounting TO qeedha_auth_lookup;
GRANT USAGE ON SCHEMA public TO qeedha_auth_lookup;
GRANT SELECT (id, company_id, password_hash, status, full_name, locale, email, mobile, deleted_at)
  ON users TO qeedha_auth_lookup;
