import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { PlatformAdminRole } from '@prisma/client';

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail({}, { message: 'بريد إلكتروني غير صحيح' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password: string;

  @IsEnum(PlatformAdminRole)
  role: PlatformAdminRole;
}
