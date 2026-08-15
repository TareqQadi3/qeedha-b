import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsUUID()
  branchId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(1)
  code: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
