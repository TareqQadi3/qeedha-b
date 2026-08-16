-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "unit_cost" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "stock_levels" ADD COLUMN     "average_cost" DECIMAL(14,4) NOT NULL DEFAULT 0;

