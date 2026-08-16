-- CreateEnum
CREATE TYPE "EInvoiceStatus" AS ENUM ('not_submitted', 'pending', 'reported', 'cleared', 'rejected');

-- CreateTable
CREATE TABLE "invoice_compliance" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "status" "EInvoiceStatus" NOT NULL DEFAULT 'not_submitted',
    "qr_code" TEXT,
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_compliance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_compliance_invoice_id_key" ON "invoice_compliance"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_compliance_company_id_status_idx" ON "invoice_compliance"("company_id", "status");

-- AddForeignKey
ALTER TABLE "invoice_compliance" ADD CONSTRAINT "invoice_compliance_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_compliance" ADD CONSTRAINT "invoice_compliance_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-Level Security, same FORCE pattern as every other tenant-owned table
-- since Phase 1 (see the original row_level_security migration).
ALTER TABLE "invoice_compliance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_compliance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invoice_compliance"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);
