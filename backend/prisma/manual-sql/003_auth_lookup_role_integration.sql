-- Follow-up to 001_auth_lookup_role.sql / 002_auth_lookup_role_update.sql
-- for Milestone 9 (Qeedha Integration).
--
-- Same "auth bootstrap" problem as human login (docs/DOMAIN_MODEL.md
-- "Current Tenant Context"), one level earlier: QeedhaIntegrationAuthGuard
-- must resolve an inbound request's `IntegrationConnection` by its
-- `public_reference` BEFORE any tenant context exists (we don't know the
-- companyId yet - that's exactly what this lookup produces).
-- `integration_connections` carries FORCE ROW LEVEL SECURITY, so the normal
-- app role cannot read it without `app.tenant_id` already set. Reuses the
-- SAME narrow, single-purpose `qeedha_auth_lookup` role rather than
-- inventing a second bootstrap mechanism - see
-- AuthLookupPrismaService/AuthLookupService.
--
-- Run once per environment by a DBA/deploy pipeline, after 001 and 002:
--   psql "$SUPERUSER_DATABASE_URL" -f prisma/manual-sql/003_auth_lookup_role_integration.sql

GRANT SELECT (id, company_id, provider_key, public_reference, secret_hash, status, system_membership_id)
  ON "integration_connections" TO qeedha_auth_lookup;
