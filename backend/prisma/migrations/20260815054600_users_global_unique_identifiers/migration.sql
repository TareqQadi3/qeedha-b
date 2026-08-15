-- email/mobile move from per-company uniqueness to globally unique.
-- Reason: login must resolve identity before a tenant context exists (see
-- AuthLookupService + docs/SECURITY.md "Auth bootstrap"). Safe at this point
-- because the users table has no production data yet.
DROP INDEX "users_company_id_email_key";
DROP INDEX "users_company_id_mobile_key";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_mobile_key" ON "users"("mobile");
