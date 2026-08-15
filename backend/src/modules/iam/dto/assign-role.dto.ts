import { IsOptional, IsUUID } from 'class-validator';

export class AssignRoleDto {
  @IsUUID()
  roleId: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
