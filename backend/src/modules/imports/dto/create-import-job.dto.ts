import { ImportEntityType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateImportJobDto {
  @IsEnum(ImportEntityType)
  entityType: ImportEntityType;

  /** Required only when entityType = opening_stock - validated in ImportsService, not here, since the requirement is conditional on another field. */
  @IsOptional()
  @IsUUID()
  targetWarehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientReferenceId?: string;
}
