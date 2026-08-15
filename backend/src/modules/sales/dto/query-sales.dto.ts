import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const SALE_STATUSES = ['completed', 'cancelled'] as const;

export class QuerySalesDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsIn(SALE_STATUSES)
  status?: (typeof SALE_STATUSES)[number];
}
