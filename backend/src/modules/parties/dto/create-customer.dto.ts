import { IsBoolean, IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @ValidateIf((dto: CreateCustomerDto) => !!dto.email)
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
