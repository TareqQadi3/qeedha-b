import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class RegisterCompanyDto {
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
