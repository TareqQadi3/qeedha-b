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
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { PRODUCT_KEYS } from '../../subscriptions/constants/products';

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

  // Phase 9 ("Control Center must manage trial period") - length of the
  // free trial this plan grants at registration. Optional, defaults to
  // the schema column's default (14) if omitted.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number;

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
  @Max(365)
  trialDays?: number;

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
