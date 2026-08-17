import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** Local methods only - 'external' exists in the schema/domain but has no adapter yet and is never client-selectable. See docs/PAYMENTS.md. */
const LOCAL_PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const;
export type LocalPaymentMethod = (typeof LOCAL_PAYMENT_METHODS)[number];

export class SaleItemInputDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  /** Per-line discount, absolute amount - never a client-supplied price override. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}

export class SalePaymentInputDto {
  @IsIn(LOCAL_PAYMENT_METHODS)
  method: LocalPaymentMethod;

  @IsNumber()
  @IsPositive()
  amount: number;
}

export class CreateSaleDto {
  @IsUUID()
  warehouseId: string;

  @IsOptional()
  @IsUUID()
  posDeviceId?: string;

  /** Omit for a walk-in/cash sale - customer is never required. */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items: SaleItemInputDto[];

  /**
   * Split payments supported natively. Milestone 7 (docs/ACCOUNTING.md
   * "Customer Credit Sales / AR"): sum may now be LESS than the computed
   * total (partial payment) or empty (fully unpaid/credit sale) - the
   * shortfall posts to Accounts Receivable and requires `customerId`. Sum
   * may never EXCEED the total (SalesService still rejects overpayment at
   * sale-creation time).
   */
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentInputDto)
  payments: SalePaymentInputDto[];

  /** Client/POS-generated idempotency key - see docs/SALES.md "Idempotency". Unique per company; a retried request with the same value returns the original sale instead of creating a duplicate. */
  @IsString()
  @IsNotEmpty()
  clientReferenceId: string;
}
