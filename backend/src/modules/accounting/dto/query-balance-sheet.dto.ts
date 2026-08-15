import { IsDateString, IsOptional } from 'class-validator';

/** Omitting asOfDate means "as of now". */
export class QueryBalanceSheetDto {
  @IsOptional()
  @IsDateString()
  asOfDate?: string;
}
