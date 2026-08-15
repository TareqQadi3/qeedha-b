import { IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

const LOCAL_PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const;

/**
 * Any change to amount/categoryId/paymentMethod re-posts the expense's
 * journal entry (reverse the old one, post a new one) - see
 * docs/EXPENSES.md "Update & the ledger". description/reference/branchId
 * are display-only and never touch accounting.
 */
export class UpdateExpenseDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsIn(LOCAL_PAYMENT_METHODS)
  paymentMethod?: (typeof LOCAL_PAYMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
