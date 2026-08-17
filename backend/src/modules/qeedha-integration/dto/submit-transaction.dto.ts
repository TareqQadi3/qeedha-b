import { IsIn, IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

/**
 * The full external field list from Milestone 9 spec section 2/7. Every
 * reference here is EXTERNAL (the caller's own vocabulary) - none of them
 * are Qeedha B database ids. `externalMerchantId` is cross-checked against
 * the authenticated connection's own `publicReference` (defense in depth -
 * catches a misconfigured caller pointing at the wrong connection, even
 * though the secret itself already scopes the request to one company).
 */
export class SubmitTransactionDto {
  @IsString()
  @IsNotEmpty()
  externalMerchantId: string;

  @IsString()
  @IsNotEmpty()
  externalCustomerReference: string;

  @IsString()
  @IsNotEmpty()
  externalTransactionId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  /** Only SAR is meaningful today (docs/PAYMENTS.md) - validated against the target sale's own currency, never trusted as the source of truth. */
  @IsIn(['SAR'])
  currencyCode: string;

  @IsString()
  @IsNotEmpty()
  invoiceReference: string;

  @IsString()
  @IsNotEmpty()
  branchReference: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}
