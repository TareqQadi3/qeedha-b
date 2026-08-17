import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

/**
 * "The integration contract should not require knowledge of Qeedha B's
 * internal Customer primary key" (Milestone 9 spec section 5) - this DTO
 * never accepts one, only the caller's own reference plus enough info to
 * create a Customer the first time that reference is ever seen.
 */
export class ResolveCustomerDto {
  @IsString()
  @IsNotEmpty()
  externalCustomerReference: string;

  /** Required only the FIRST time this reference is resolved (no mapping exists yet) - see QeedhaTransactionService.resolveCustomer. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @ValidateIf((dto: ResolveCustomerDto) => !!dto.email)
  @IsEmail({}, { message: 'بريد إلكتروني غير صحيح' })
  email?: string;
}
