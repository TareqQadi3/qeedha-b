-- Manual, superuser-run DDL. NOT a Prisma migration - see
-- 001_auth_lookup_role.sql for why this can't be a normal migration.
--
-- Purpose: the Website phase added `companies.country_code` (see
-- schema.prisma Company model, migration 20260819085616_website_platform)
-- and PlatformAdminService's merchant listing now selects it, but the
-- column-level GRANT in 004_platform_admin_role.sql predates that column
-- and doesn't include it. Postgres rejects the WHOLE query (42501
-- "permission denied for table companies") if even one selected column
-- isn't granted, not just the missing column - so the fix is an
-- additional narrow grant, not a wider one.
--
-- Run once per environment by a DBA/deploy pipeline:
--   psql "$SUPERUSER_DATABASE_URL" -f prisma/manual-sql/006_platform_admin_role_companies_country.sql

GRANT SELECT (country_code) ON "companies" TO qeedha_platform_admin;
