-- CreateEnum
CREATE TYPE "ImportEntityType" AS ENUM ('products', 'barcodes', 'categories', 'units', 'customers', 'suppliers', 'opening_stock');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('uploaded', 'analyzing', 'ready', 'validating', 'validated', 'importing', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "entity_type" "ImportEntityType" NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'uploaded',
    "target_warehouse_id" UUID,
    "file_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "detected_columns" JSONB,
    "column_mapping" JSONB,
    "total_rows" INTEGER,
    "valid_rows" INTEGER,
    "error_rows" INTEGER,
    "imported_rows" INTEGER,
    "validation_errors" JSONB,
    "failure_reason" TEXT,
    "client_reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "validated_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_jobs_company_id_status_idx" ON "import_jobs"("company_id", "status");

-- CreateIndex
CREATE INDEX "import_jobs_company_id_entity_type_created_at_idx" ON "import_jobs"("company_id", "entity_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "import_jobs_company_id_client_reference_id_key" ON "import_jobs"("company_id", "client_reference_id");

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-Level Security, same FORCE pattern as every other tenant-owned table
-- since Phase 1 (see the original row_level_security migration).
ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "import_jobs"
  USING (company_id = current_setting('app.tenant_id', true)::uuid);
