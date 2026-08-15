import { IsBoolean, IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @ValidateIf((dto: CreateSupplierDto) => !!dto.email)
  @IsEmail({}, { message: 'بريد إلكتروني غير صحيح' })
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
