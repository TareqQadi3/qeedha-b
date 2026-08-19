import { IsEnum, IsInt, IsString, Max, Min } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

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
