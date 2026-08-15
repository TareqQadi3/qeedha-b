import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateFiscalPeriodDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
