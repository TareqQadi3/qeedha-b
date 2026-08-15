import { IsEmail, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @ValidateIf((dto: CreateUserDto) => !dto.mobile)
  @IsEmail({}, { message: 'بريد إلكتروني غير صحيح' })
  email?: string;

  @ValidateIf((dto: CreateUserDto) => !dto.email)
  @IsString()
  mobile?: string;

  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
