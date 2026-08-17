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

export class PurchaseReturnItemInputDto {
  /** The original PurchaseItem line being (partially) returned - only RECEIVED quantities can be returned. */
  @IsUUID()
  purchaseItemId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;
}

/**
 * Milestone 7 (docs/ACCOUNTING.md "Purchase Returns"): returns previously
 * RECEIVED purchase items to a supplier. Multiple returns against the same
 * purchase are allowed - PurchasesService.createReturn validates cumulative
 * returned quantity per line never exceeds what was originally received.
 */
export class CreatePurchaseReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnItemInputDto)
  items: PurchaseReturnItemInputDto[];

  @IsOptional()
  @IsString()
  reason?: string;

  /** Idempotency key, same model as Purchase.clientReferenceId. */
  @IsString()
  @IsNotEmpty()
  clientReferenceId: string;
}
