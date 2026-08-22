import { Type } from 'class-transformer';
import { IsInt, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class EmployeeLoginDto {
  /** رقم الاشتراك - يحدّد المنشأة */
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  subscriptionNumber: number;

  /** الفرع المختار من القائمة المنسدلة (GET /auth/companies/:subscriptionNumber/branches) */
  @IsUUID()
  branchId: string;

  @IsString()
  @MinLength(1)
  username: string;

  @IsString()
  @MinLength(1)
  password: string;
}
