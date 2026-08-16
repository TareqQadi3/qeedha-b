import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class SetOpeningBalanceDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  /**
   * Cost basis for this opening stock - docs/ACCOUNTING.md "COGS / Inventory
   * Valuation" "Opening Stock". Omit to fall back to Product.costPrice (the
   * existing, pre-Milestone-6 catch-all cost field) - opening balance always
   * starts from zero stock (enforced above), so there is never an "existing
   * average" to fall back to instead.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
