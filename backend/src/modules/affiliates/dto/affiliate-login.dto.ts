import { IsEmail, IsString, MinLength } from 'class-validator';

export class AffiliateLoginDto {
  @IsEmail({}, { message: 'بريد إلكتروني غير صحيح' })
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}
