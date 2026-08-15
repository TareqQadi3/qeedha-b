import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class TransferStockDto {
  @IsUUID()
  fromWarehouseId: string;

  @IsUUID()
  toWarehouseId: string;

  @IsUUID()
  productId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
