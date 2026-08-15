import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class SetOpeningBalanceDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
