-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('opening_balance', 'purchase', 'sale', 'return', 'adjustment', 'transfer_in', 'transfer_out', 'damage', 'expiry', 'manual_correction');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('draft', 'completed', 'cancelled');

-- DropForeignKey
ALTER TABLE "membership_roles" DROP CONSTRAINT "membership_roles_branch_id_fkey";

-- AlterTable
ALTER TABLE "membership_roles" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "memberships" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" UUID,
    "brand_id" UUID,
    "unit_id" UUID,
    "cost_price" DECIMAL(14,2) NOT NULL,
    "selling_price" DECIMAL(14,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "min_stock_threshold" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "image_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_barcodes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "barcode" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_on_hand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "actor_membership_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_delta" DECIMAL(14,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "actor_membership_id" UUID NOT NULL,
    "stock_movement_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'draft',
    "actor_membership_id" UUID NOT NULL,
    "notes" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "stock_count_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "expected_quantity" DECIMAL(14,3) NOT NULL,
    "counted_quantity" DECIMAL(14,3),

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "tax_number" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "tax_number" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "units_company_id_deleted_at_idx" ON "units"("company_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "units_company_id_name_key" ON "units"("company_id", "name");

-- CreateIndex
CREATE INDEX "product_categories_company_id_parent_id_deleted_at_idx" ON "product_categories"("company_id", "parent_id", "deleted_at");

-- CreateIndex
CREATE INDEX "brands_company_id_deleted_at_idx" ON "brands"("company_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "brands_company_id_name_key" ON "brands"("company_id", "name");

-- CreateIndex
CREATE INDEX "products_company_id_deleted_at_idx" ON "products"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "products_company_id_is_active_idx" ON "products"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "products_company_id_name_idx" ON "products"("company_id", "name");

-- CreateIndex
CREATE INDEX "products_company_id_category_id_idx" ON "products"("company_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_company_id_sku_key" ON "products"("company_id", "sku");

-- CreateIndex
CREATE INDEX "product_barcodes_company_id_product_id_idx" ON "product_barcodes"("company_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_barcodes_company_id_barcode_key" ON "product_barcodes"("company_id", "barcode");

-- CreateIndex
CREATE INDEX "stock_levels_company_id_product_id_idx" ON "stock_levels"("company_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_company_id_warehouse_id_product_id_key" ON "stock_levels"("company_id", "warehouse_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_movements_company_id_warehouse_id_product_id_created__idx" ON "stock_movements"("company_id", "warehouse_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_company_id_reference_type_reference_id_idx" ON "stock_movements"("company_id", "reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_stock_movement_id_key" ON "stock_adjustments"("stock_movement_id");

-- CreateIndex
CREATE INDEX "stock_adjustments_company_id_warehouse_id_product_id_idx" ON "stock_adjustments"("company_id", "warehouse_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_counts_company_id_warehouse_id_status_idx" ON "stock_counts"("company_id", "warehouse_id", "status");

-- CreateIndex
CREATE INDEX "stock_count_lines_company_id_stock_count_id_idx" ON "stock_count_lines"("company_id", "stock_count_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_stock_count_id_product_id_key" ON "stock_count_lines"("stock_count_id", "product_id");

-- CreateIndex
CREATE INDEX "customers_company_id_deleted_at_idx" ON "customers"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "customers_company_id_name_idx" ON "customers"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_id_reference_key" ON "customers"("company_id", "reference");

-- CreateIndex
CREATE INDEX "suppliers_company_id_deleted_at_idx" ON "suppliers"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "suppliers_company_id_name_idx" ON "suppliers"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_reference_key" ON "suppliers"("company_id", "reference");

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security, same FORCE pattern as every other tenant-owned table
-- since Phase 1 (see the original row_level_security migration).
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "units"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "product_categories"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "brands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brands" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "brands"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "products"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "product_barcodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_barcodes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "product_barcodes"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "stock_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_levels" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_levels"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_movements"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "stock_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_adjustments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_adjustments"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "stock_counts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_counts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_counts"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "stock_count_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_count_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_count_lines"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "customers"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "suppliers"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);

