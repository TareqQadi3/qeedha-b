import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/** Local methods only, same set as SalePaymentInputDto - see docs/PAYMENTS.md. */
const LOCAL_PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const;
export type LocalPaymentMethod = (typeof LOCAL_PAYMENT_METHODS)[number];

/**
 * Milestone 7 (docs/ACCOUNTING.md "Customer Credit Sales / AR"): records a
 * standalone payment against an existing sale's OUTSTANDING (unpaid) AR
 * balance - never a new sale, never a way to overpay. Amount is validated
 * server-side against the sale's remaining balance (totalAmount minus every
 * existing Payment for it) inside SalesService.recordPayment; it is never
 * trusted as-is.
 */
export class RecordSalePaymentDto {
  @IsIn(LOCAL_PAYMENT_METHODS)
  method: LocalPaymentMethod;

  @IsNumber()
  @IsPositive()
  amount: number;

  /** Idempotency key, same model as Sale/Purchase.clientReferenceId - a retried request with the same value returns the original payment instead of creating a duplicate. */
  @IsString()
  @IsNotEmpty()
  clientReferenceId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
