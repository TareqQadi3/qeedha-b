import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryStockCountsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
