import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/** Local methods only, same set as sales payments - see docs/PAYMENTS.md. */
const LOCAL_PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const;
export type LocalPaymentMethod = (typeof LOCAL_PAYMENT_METHODS)[number];

/**
 * Milestone 7 (docs/ACCOUNTING.md "Supplier Payments / AP"): records a
 * payment TO a supplier settling (part of) a specific purchase's Accounts
 * Payable balance - amount is validated server-side against that purchase's
 * remaining balance inside PurchasesService.recordPayment, never trusted
 * as-is.
 */
export class RecordSupplierPaymentDto {
  @IsIn(LOCAL_PAYMENT_METHODS)
  method: LocalPaymentMethod;

  @IsNumber()
  @IsPositive()
  amount: number;

  /** Free-text bank/cheque/transfer reference. */
  @IsOptional()
  @IsString()
  reference?: string;

  /** Idempotency key, same model as Sale/Purchase.clientReferenceId. */
  @IsString()
  @IsNotEmpty()
  clientReferenceId: string;
}
