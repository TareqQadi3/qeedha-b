import { IsString, IsUUID } from 'class-validator';

export class SelectTenantDto {
  @IsString()
  tenantSelectionToken: string;

  @IsUUID()
  companyId: string;
}
