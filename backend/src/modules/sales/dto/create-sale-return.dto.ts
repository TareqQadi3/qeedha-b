import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class SaleReturnItemInputDto {
  /** The original SaleItem line being (partially) returned - not a productId, since the same product can appear only once per sale but must resolve to one exact historical line/cost. */
  @IsUUID()
  saleItemId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;
}

/**
 * Milestone 7 (docs/ACCOUNTING.md "Sales Returns"): a genuine partial/full
 * return of previously sold items, distinct from Sale cancellation. Multiple
 * returns against the same sale are allowed - SalesReturnService validates
 * cumulative returned quantity per line never exceeds what was originally
 * sold, across every return so far.
 */
export class CreateSaleReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleReturnItemInputDto)
  items: SaleReturnItemInputDto[];

  @IsOptional()
  @IsString()
  reason?: string;

  /** Idempotency key, same model as Sale.clientReferenceId. */
  @IsString()
  @IsNotEmpty()
  clientReferenceId: string;
}
