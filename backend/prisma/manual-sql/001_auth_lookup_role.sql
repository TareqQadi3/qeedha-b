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

-- Milestone 10 (production release hardening): the literal database name
-- "qeedha_accounting" here was dev-only - this script also runs against
-- qeedha_accounting_test/_e2e (CI) and whatever name a real production
-- database happens to use, so the GRANT CONNECT target must follow
-- whichever database this script is actually being run against.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO qeedha_auth_lookup', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO qeedha_auth_lookup;

-- Milestone 10 (production release hardening): this script originally also
-- granted SELECT on `users` (incl. a `company_id` column) here - that
-- column was removed by the later Auth/IAM identity refactor migration
-- (see docs/DOMAIN_MODEL.md), making this exact GRANT permanently invalid
-- (fails with "column company_id of relation users does not exist" on
-- every fresh apply since). It served no purpose anyway:
-- 002_auth_lookup_role_update.sql immediately REVOKEs this same grant
-- ("users is no longer tenant-owned data... the normal app role can now
-- query users directly"), so it is removed here rather than fixed to a
-- column list that would just be revoked one script later.
