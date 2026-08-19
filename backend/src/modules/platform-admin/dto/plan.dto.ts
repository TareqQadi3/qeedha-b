import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

const PRODUCT_KEYS = ['qeedha_b', 'qeedha'] as const;

export class CreatePlanDto {
  @IsString()
  @Matches(/^[a-z0-9_-]{2,32}$/, {
    message: 'رمز الخطة يجب أن يكون أحرفًا إنجليزية صغيرة/أرقامًا فقط',
  })
  code: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMonthlySar?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceAnnualSar?: number;

  @IsOptional()
  @IsIn(['monthly', 'annual'])
  billingInterval?: string;

  @IsOptional()
  @IsBoolean()
  trialEligible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxBranches?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxMonthlySales?: number;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;

  @IsOptional()
  @IsArray()
  @IsIn(PRODUCT_KEYS, { each: true })
  products?: string[];

  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMonthlySar?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceAnnualSar?: number;

  @IsOptional()
  @IsIn(['monthly', 'annual'])
  billingInterval?: string;

  @IsOptional()
  @IsBoolean()
  trialEligible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxBranches?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxMonthlySales?: number;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;

  @IsOptional()
  @IsArray()
  @IsIn(PRODUCT_KEYS, { each: true })
  products?: string[];

  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
