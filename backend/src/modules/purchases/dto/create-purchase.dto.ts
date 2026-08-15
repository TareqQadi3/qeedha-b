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
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseItemInputDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  /** Actual negotiated unit cost for this purchase - not read from Product.costPrice, which is only a display default. */
  @IsNumber()
  @Min(0)
  unitCost: number;

  /** Defaults to the product's current vatRate if omitted. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  vatRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}

export class CreatePurchaseDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  supplierId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemInputDto)
  items: PurchaseItemInputDto[];

  /** Client-generated idempotency key - same model as Sale.clientReferenceId. */
  @IsString()
  @IsNotEmpty()
  clientReferenceId: string;
}
