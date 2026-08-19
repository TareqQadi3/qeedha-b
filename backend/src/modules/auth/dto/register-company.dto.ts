import { IsEmail, IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';

export class RegisterCompanyDto {
  @IsString()
  @MinLength(2)
  legalName: string;

  // Website phase ("Language and country"): Market.code the merchant
  // picked on the website before registering. Optional and defaults to
  // 'SA' in AuthService - every pre-Website-phase caller (including every
  // existing e2e test) keeps working unchanged. Not validated against the
  // Market table here (a DTO-level FK check would reject a market that's
  // temporarily deactivated mid-registration for no good reason) - see
  // AuthService.createCompanyWithOwner.
  @IsOptional()
  @IsString()
  countryCode?: string;

  // Website phase ("Packages/Commercial model"): Plan.code the merchant
  // selected on the pricing page. Optional and defaults to
  // PLAN_CODES.PROFESSIONAL in AuthService, unchanged from before this
  // field existed.
  @IsOptional()
  @IsString()
  planCode?: string;

  // Website phase ("Affiliate system"): the `?ref=<code>` value captured
  // from the referral link, if any. Optional - most registrations have
  // none. Silently ignored if the code doesn't match any Affiliate (see
  // AuthService) rather than rejecting registration over it.
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,32}$/)
  referralCode?: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  vatNumber?: string;

  @IsOptional()
  @IsString()
  crNumber?: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsString()
  @MinLength(2)
  ownerFullName: string;

  @ValidateIf((dto: RegisterCompanyDto) => !dto.ownerMobile)
  @IsEmail({}, { message: 'بريد إلكتروني غير صحيح' })
  ownerEmail?: string;

  @ValidateIf((dto: RegisterCompanyDto) => !dto.ownerEmail)
  @IsString()
  ownerMobile?: string;

  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password: string;
}
