import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  NotEquals,
} from 'class-validator';

export class AdjustStockDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  productId: string;

  /** Signed: positive increases stock, negative decreases it. Never zero - that wouldn't be an adjustment. */
  @IsNumber()
  @NotEquals(0)
  quantityDelta: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  reason: string;

  /**
   * Cost basis for a positive (increasing) adjustment - docs/ACCOUNTING.md
   * "COGS / Inventory Valuation" "Adjustments". Ignored for a negative
   * (decreasing) adjustment, which always uses the existing average cost.
   * Omit to fall back to the current average cost of this product/warehouse
   * (or Product.costPrice if it has never carried stock here) - a
   * deliberate, documented default, not a silent guess.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
