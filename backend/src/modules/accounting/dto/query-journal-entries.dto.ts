import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryJournalEntriesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  referenceType?: string;
}
