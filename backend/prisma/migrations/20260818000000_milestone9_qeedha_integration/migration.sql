-- CreateEnum
CREATE TYPE "IntegrationTransactionStatus" AS ENUM ('success', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "integration_connections" ADD COLUMN     "public_reference" TEXT,
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ADD COLUMN     "secret_hash" TEXT,
ADD COLUMN     "secret_last_four" TEXT,
ADD COLUMN     "system_membership_id" UUID;

-- CreateTable
CREATE TABLE "integration_customer_mappings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "external_customer_reference" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_customer_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_transactions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sale_id" UUID,
    "payment_id" UUID,
    "customer_id" UUID,
    "external_transaction_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "IntegrationTransactionStatus" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "invoice_reference" TEXT NOT NULL,
    "branch_reference" TEXT NOT NULL,
    "failure_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_customer_mappings_company_id_customer_id_idx" ON "integration_customer_mappings"("company_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_customer_mappings_company_id_connection_id_exte_key" ON "integration_customer_mappings"("company_id", "connection_id", "external_customer_reference");

-- CreateIndex
CREATE UNIQUE INDEX "integration_transactions_payment_id_key" ON "integration_transactions"("payment_id");

-- CreateIndex
CREATE INDEX "integration_transactions_company_id_connection_id_external__idx" ON "integration_transactions"("company_id", "connection_id", "external_transaction_id");

-- CreateIndex
CREATE INDEX "integration_transactions_company_id_status_idx" ON "integration_transactions"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_transactions_company_id_connection_id_idempoten_key" ON "integration_transactions"("company_id", "connection_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_public_reference_key" ON "integration_connections"("public_reference");

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_system_membership_id_fkey" FOREIGN KEY ("system_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_customer_mappings" ADD CONSTRAINT "integration_customer_mappings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_customer_mappings" ADD CONSTRAINT "integration_customer_mappings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_customer_mappings" ADD CONSTRAINT "integration_customer_mappings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_transactions" ADD CONSTRAINT "integration_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_transactions" ADD CONSTRAINT "integration_transactions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_transactions" ADD CONSTRAINT "integration_transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_transactions" ADD CONSTRAINT "integration_transactions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_transactions" ADD CONSTRAINT "integration_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_transactions" ADD CONSTRAINT "integration_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security (docs/SECURITY.md "Row-Level Security", same pattern as
-- every prior migration): both new tables carry company_id and are tenant
-- data, so both get the standard FORCE RLS + tenant_isolation policy.
-- "integration_connections" itself already has RLS from the original
-- 20260815054500_row_level_security migration - only new COLUMNS were added
-- to it here, so no policy change is needed for that table.
ALTER TABLE "integration_customer_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_customer_mappings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "integration_customer_mappings"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "integration_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_transactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "integration_transactions"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

