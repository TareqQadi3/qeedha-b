import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

/** Local methods only, same set as CreateSaleDto - see docs/PAYMENTS.md. */
const LOCAL_PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const;

export class CreateExpenseDto {
  @IsUUID()
  categoryId: string;

  /** Omit for a company-level expense - never forced onto a branch (docs/EXPENSES.md). */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsIn(LOCAL_PAYMENT_METHODS)
  paymentMethod: (typeof LOCAL_PAYMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  /** Client-generated idempotency key - same model as Sale.clientReferenceId. */
  @IsString()
  @IsNotEmpty()
  clientReferenceId: string;
}
