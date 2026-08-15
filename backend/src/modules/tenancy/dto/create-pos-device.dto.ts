import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreatePosDeviceDto {
  @IsUUID()
  branchId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(1)
  deviceCode: string;
}
