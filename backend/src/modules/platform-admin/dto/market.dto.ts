import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateMarketDto {
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'رمز الدولة يجب أن يكون حرفين إنجليزيين كبيرين (ISO 3166-1 alpha-2)',
  })
  code: string;

  @IsString()
  @MinLength(2)
  nameAr: string;

  @IsString()
  @MinLength(2)
  nameEn: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'رمز العملة يجب أن يكون 3 أحرف (ISO 4217)' })
  currency: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedLanguages?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}

export class UpdateMarketDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'رمز العملة يجب أن يكون 3 أحرف (ISO 4217)' })
  currency?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedLanguages?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}
