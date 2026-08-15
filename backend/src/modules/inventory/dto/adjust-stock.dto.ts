import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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

  @IsOptional()
  @IsString()
  notes?: string;
}
