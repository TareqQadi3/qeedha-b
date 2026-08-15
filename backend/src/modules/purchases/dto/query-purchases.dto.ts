import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const PURCHASE_STATUSES = ['ordered', 'received', 'cancelled'] as const;

export class QueryPurchasesDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsIn(PURCHASE_STATUSES)
  status?: (typeof PURCHASE_STATUSES)[number];
}
