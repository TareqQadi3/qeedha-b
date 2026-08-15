import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/** Only display/status fields are editable - code and type are fixed identity for a lookup-by-code account (docs/ACCOUNTING.md "Account Mapping"). */
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
