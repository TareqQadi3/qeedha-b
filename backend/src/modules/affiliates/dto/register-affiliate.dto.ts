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

  // Phase 9 ("Affiliate Dashboard" self-service login) - required so every
  // newly-registered affiliate can log into their own dashboard
  // immediately, same as a merchant owner's password at company
  // registration.
  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password: string;
}
