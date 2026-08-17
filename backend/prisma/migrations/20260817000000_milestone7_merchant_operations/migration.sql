-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "client_reference_id" TEXT;

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "reference" TEXT,
    "client_reference_id" TEXT NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "reason" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "client_reference_id" TEXT NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "sale_return_id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "unit_cost" DECIMAL(14,4),
    "line_subtotal" DECIMAL(14,2) NOT NULL,
    "line_tax" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "reason" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "client_reference_id" TEXT NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "purchase_return_id" UUID NOT NULL,
    "purchase_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "line_subtotal" DECIMAL(14,2) NOT NULL,
    "line_tax" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID,
    "account_code" TEXT NOT NULL,
    "as_of_date" DATE NOT NULL,
    "statement_balance" DECIMAL(14,2) NOT NULL,
    "book_balance" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "actor_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_payments_company_id_purchase_id_idx" ON "supplier_payments"("company_id", "purchase_id");

-- CreateIndex
CREATE INDEX "supplier_payments_company_id_supplier_id_idx" ON "supplier_payments"("company_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_company_id_client_reference_id_key" ON "supplier_payments"("company_id", "client_reference_id");

-- CreateIndex
CREATE INDEX "sale_returns_company_id_sale_id_idx" ON "sale_returns"("company_id", "sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_company_id_client_reference_id_key" ON "sale_returns"("company_id", "client_reference_id");

-- CreateIndex
CREATE INDEX "sale_return_items_company_id_sale_return_id_idx" ON "sale_return_items"("company_id", "sale_return_id");

-- CreateIndex
CREATE INDEX "sale_return_items_company_id_sale_item_id_idx" ON "sale_return_items"("company_id", "sale_item_id");

-- CreateIndex
CREATE INDEX "purchase_returns_company_id_purchase_id_idx" ON "purchase_returns"("company_id", "purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_company_id_client_reference_id_key" ON "purchase_returns"("company_id", "client_reference_id");

-- CreateIndex
CREATE INDEX "purchase_return_items_company_id_purchase_return_id_idx" ON "purchase_return_items"("company_id", "purchase_return_id");

-- CreateIndex
CREATE INDEX "purchase_return_items_company_id_purchase_item_id_idx" ON "purchase_return_items"("company_id", "purchase_item_id");

-- CreateIndex
CREATE INDEX "bank_reconciliations_company_id_account_code_as_of_date_idx" ON "bank_reconciliations"("company_id", "account_code", "as_of_date");

-- CreateIndex
CREATE UNIQUE INDEX "payments_company_id_client_reference_id_key" ON "payments"("company_id", "client_reference_id");

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security, same FORCE pattern as every other tenant-owned table
-- since Phase 1 (see the original row_level_security migration).
ALTER TABLE "supplier_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_payments"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "sale_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_returns" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sale_returns"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "sale_return_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_return_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sale_return_items"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "purchase_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_returns" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_returns"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "purchase_return_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_return_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_return_items"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "bank_reconciliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_reconciliations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bank_reconciliations"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

-- Data migration: backfill the 3 new Chart of Accounts entries (Sales
-- Returns 4020, Inventory Adjustment Gain 4030, Inventory Adjustment
-- Expense 5011) for every company that already exists (registered before
-- this migration and therefore never got them from
-- AccountingService.seedDefaultChartOfAccounts). Companies registered
-- AFTER this migration get them automatically via that same seeding path -
-- see default-chart-of-accounts.ts. Idempotent via NOT EXISTS guards so
-- this migration can be safely re-run in a fresh environment where
-- companies already carry the new accounts.
INSERT INTO "accounts" (id, company_id, code, name, type, parent_id, is_active, created_at, updated_at)
SELECT gen_random_uuid(), c.id, '4020', 'مرتجعات المبيعات', 'revenue', rev.id, true, now(), now()
FROM "companies" c
JOIN "accounts" rev ON rev.company_id = c.id AND rev.code = '4000'
WHERE NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a.company_id = c.id AND a.code = '4020');

INSERT INTO "accounts" (id, company_id, code, name, type, parent_id, is_active, created_at, updated_at)
SELECT gen_random_uuid(), c.id, '4030', 'أرباح تسوية المخزون', 'revenue', rev.id, true, now(), now()
FROM "companies" c
JOIN "accounts" rev ON rev.company_id = c.id AND rev.code = '4000'
WHERE NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a.company_id = c.id AND a.code = '4030');

INSERT INTO "accounts" (id, company_id, code, name, type, parent_id, is_active, created_at, updated_at)
SELECT gen_random_uuid(), c.id, '5011', 'مصروف تسوية/عجز المخزون', 'expense', exp.id, true, now(), now()
FROM "companies" c
JOIN "accounts" exp ON exp.company_id = c.id AND exp.code = '5000'
WHERE NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a.company_id = c.id AND a.code = '5011');

