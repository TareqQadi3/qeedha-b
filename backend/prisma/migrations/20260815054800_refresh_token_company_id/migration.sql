-- Denormalized company_id cache on refresh_tokens so the refresh flow can
-- mint a new access token without needing tenant context first. Safe: no
-- data yet in this table.
ALTER TABLE "refresh_tokens" ADD COLUMN "company_id" UUID NOT NULL;
