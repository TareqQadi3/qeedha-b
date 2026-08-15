import { IsDateString, IsOptional } from 'class-validator';

/** Both bounds optional and inclusive - omitting dateFrom means "since the beginning". */
export class QueryDateRangeDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
