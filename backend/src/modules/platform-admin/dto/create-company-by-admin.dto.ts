import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

/** Same shape as RegisterCompanyDto (self-service registration) - a platform admin fills in the same fields on the merchant's behalf. */
export class CreateCompanyByAdminDto {
  @IsString()
  @MinLength(2)
  legalName: string;

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

  // Website phase: admin picks the merchant's market and package, same as
  // the merchant would on the public pricing page. Optional (defaults
  // applied in AuthService.createCompanyWithOwner) - no referralCode here,
  // that's specifically for organic website signups, not admin-created
  // companies.
  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  planCode?: string;

  @IsString()
  @MinLength(2)
  ownerFullName: string;

  @ValidateIf((dto: CreateCompanyByAdminDto) => !dto.ownerMobile)
  @IsEmail({}, { message: 'بريد إلكتروني غير صحيح' })
  ownerEmail?: string;

  @ValidateIf((dto: CreateCompanyByAdminDto) => !dto.ownerEmail)
  @IsString()
  ownerMobile?: string;

  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password: string;
}
