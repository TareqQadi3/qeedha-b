-- CreateEnum
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMP(3),
    "closed_by_membership_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_periods_company_id_start_date_end_date_idx" ON "fiscal_periods"("company_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "fiscal_periods_company_id_status_idx" ON "fiscal_periods"("company_id", "status");

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security, same FORCE pattern as every other tenant-owned table
-- since Phase 1. fiscal_periods is company_id-scoped tenant data.
ALTER TABLE "fiscal_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fiscal_periods"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

