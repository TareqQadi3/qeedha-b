import { AccountType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(ACCOUNT_TYPES)
  type: AccountType;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
