import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateStockCountDto {
  @IsUUID()
  warehouseId: string;

  /** Products to count. Omit to include every product with an existing stock_levels row in this warehouse. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}
