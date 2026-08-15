import { IsUUID } from 'class-validator';
import { QueryDateRangeDto } from './query-date-range.dto';

export class QueryGeneralLedgerDto extends QueryDateRangeDto {
  @IsUUID()
  accountId: string;
}
