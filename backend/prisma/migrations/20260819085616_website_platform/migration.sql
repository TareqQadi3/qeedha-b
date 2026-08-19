-- CreateEnum
CREATE TYPE "PlatformAdminRole" AS ENUM ('admin', 'finance', 'support', 'marketing', 'developer');

-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('pending', 'approved', 'paid');

-- CreateEnum
CREATE TYPE "JoinApplicationStatus" AS ENUM ('new', 'reviewed', 'accepted', 'rejected');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "country_code" TEXT NOT NULL DEFAULT 'SA';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "display_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_recommended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "price_annual_sar" DECIMAL(10,2),
ADD COLUMN     "products" JSONB NOT NULL DEFAULT '["qeedha_b"]';

-- AlterTable
ALTER TABLE "platform_admins" ADD COLUMN     "role" "PlatformAdminRole" NOT NULL DEFAULT 'admin';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "supported_languages" JSONB NOT NULL DEFAULT '["ar","en"]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "affiliates" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "code" TEXT NOT NULL,
    "commission_percent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_referrals" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" UUID NOT NULL,
    "affiliate_referral_id" UUID NOT NULL,
    "amount_sar" DECIMAL(10,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "join_applications" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "role" TEXT NOT NULL,
    "message" TEXT,
    "cv_file_key" TEXT,
    "status" "JoinApplicationStatus" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "join_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_email_key" ON "affiliates"("email");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_code_key" ON "affiliates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_referrals_company_id_key" ON "affiliate_referrals"("company_id");

-- CreateIndex
CREATE INDEX "affiliate_referrals_affiliate_id_idx" ON "affiliate_referrals"("affiliate_id");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_affiliate_referral_id_key" ON "commissions"("affiliate_referral_id");

-- CreateIndex
CREATE INDEX "join_applications_status_idx" ON "join_applications"("status");

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_referrals" ADD CONSTRAINT "affiliate_referrals_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_affiliate_referral_id_fkey" FOREIGN KEY ("affiliate_referral_id") REFERENCES "affiliate_referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the initial market (Website phase spec: "Initial market: Saudi
-- Arabia"). Every other market is added later via the Control Center
-- (Market model), never hardcoded again after this one bootstrap row.
INSERT INTO "markets" ("code", "name_ar", "name_en", "currency", "supported_languages", "is_active", "display_order", "updated_at")
VALUES ('SA', 'المملكة العربية السعودية', 'Saudi Arabia', 'SAR', '["ar","en"]', true, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
