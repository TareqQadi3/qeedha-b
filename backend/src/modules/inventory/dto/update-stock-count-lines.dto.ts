import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsUUID, Min, ValidateNested } from 'class-validator';

class StockCountLineInput {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0)
  countedQuantity: number;
}

export class UpdateStockCountLinesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockCountLineInput)
  lines: StockCountLineInput[];
}
