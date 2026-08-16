import { ImportEntityType, ImportJobStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryImportJobsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ImportEntityType)
  entityType?: ImportEntityType;

  @IsOptional()
  @IsEnum(ImportJobStatus)
  status?: ImportJobStatus;
}
