import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @MinLength(2)
  name: string;

  /** Which expense (P&L) account this category posts to - omit to use the default "مصروفات أخرى" account. */
  @IsOptional()
  @IsUUID()
  accountId?: string;
}
