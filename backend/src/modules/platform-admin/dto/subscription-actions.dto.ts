import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';
import { PRODUCT_KEYS } from '../../subscriptions/constants/products';

export class SetSubscriptionStatusDto {
  @IsEnum(SubscriptionStatus)
  status: SubscriptionStatus;
}

export class ChangeSubscriptionPlanDto {
  @IsString()
  planCode: string;
}

export class ExtendTrialDto {
  @IsInt()
  @Min(1)
  @Max(365)
  days: number;
}

/**
 * Phase 13 ("لوحة تحكمي، أخصص أي باقة"): per-company overrides of the
 * plan's resource limits. Every field is optional AND nullable - omit a
 * field to leave it untouched, or send it as `null` explicitly to clear
 * that override back to "use the plan's value" (never send it to mean
 * "no limit" - use 0 for that, since 0 is a real, allowed override value,
 * e.g. maxManagers: 0 on the basic tier).
 */
export class SetSubscriptionOverridesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  usersOverride?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  branchesOverride?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  warehousesOverride?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  cashiersOverride?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  accountantsOverride?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  managersOverride?: number | null;

  // The قيّدها/installment add-on lives here - include 'qeedha' in this
  // array to grant it to this one company regardless of its plan.
  @IsOptional()
  @IsArray()
  @IsIn(PRODUCT_KEYS, { each: true })
  productsOverride?: string[] | null;
}
