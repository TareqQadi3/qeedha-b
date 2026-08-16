import { IsObject } from 'class-validator';

export class SetImportMappingDto {
  /** targetField -> 0-based source column index. Depth-validated in ImportsService (required fields present, indices in range) for domain-specific error messages. */
  @IsObject()
  mapping: Record<string, number>;
}
