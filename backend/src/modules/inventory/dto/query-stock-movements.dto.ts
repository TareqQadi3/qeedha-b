import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const MOVEMENT_TYPES = [
  'opening_balance',
  'purchase',
  'sale',
  'return',
  'adjustment',
  'transfer_in',
  'transfer_out',
  'damage',
  'expiry',
  'manual_correction',
] as const;

export class QueryStockMovementsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsIn(MOVEMENT_TYPES)
  type?: (typeof MOVEMENT_TYPES)[number];
}
