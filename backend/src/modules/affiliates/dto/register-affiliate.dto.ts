import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterAffiliateDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail({}, { message: 'بريد إلكتروني غير صحيح' })
  email: string;

  @IsOptional()
  @IsString()
  mobile?: string;
}
