-- AlterTable
ALTER TABLE "affiliates" ADD COLUMN     "password_hash" TEXT;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "trial_days" INTEGER NOT NULL DEFAULT 14;

-- Phase 9 ("Registration integrity" - "strengthen duplicate email/mobile
-- protection at database level"). Partial (not full) unique indexes:
-- `email`/`mobile` are plain nullable columns (not `@unique` in
-- schema.prisma) because team members created via IamService.createUser
-- routinely have neither - only a username. A normal UNIQUE constraint on
-- a nullable Postgres column already allows multiple NULLs, but "multiple
-- rows with the exact same non-null email" is exactly the case this
-- closes. This is a normal DDL statement the app's own migration role can
-- run (unlike prisma/manual-sql/*, which needs superuser for
-- role/BYPASSRLS setup) - a real Prisma migration, not manual-sql.
--
-- AuthService.createCompanyWithOwner keeps its existing application-level
-- pre-check (fast, friendly 409 in the common case) AND now catches the
-- Prisma P2002 this index produces as a backstop for the concurrent-
-- registration race the pre-check alone couldn't close - see AuthService.
CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" ("email") WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "users_mobile_unique_idx" ON "users" ("mobile") WHERE "mobile" IS NOT NULL;
