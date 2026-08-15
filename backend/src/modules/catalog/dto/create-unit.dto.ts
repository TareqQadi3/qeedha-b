import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUnitDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  symbol?: string;
}
