import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreatePosDeviceDto } from './dto/create-pos-device.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { TenancyService } from './tenancy.service';

@Controller('tenancy')
export class TenancyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancyService: TenancyService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.TENANCY_BRANCHES_VIEW)
  @Get('branches')
  listBranches(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.tenancyService.listBranches(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.TENANCY_BRANCHES_MANAGE)
  @Post('branches')
  createBranch(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBranchDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.tenancyService.createBranch(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.TENANCY_WAREHOUSES_VIEW)
  @Get('warehouses')
  listWarehouses(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.tenancyService.listWarehouses(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.TENANCY_WAREHOUSES_MANAGE)
  @Post('warehouses')
  createWarehouse(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWarehouseDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.tenancyService.createWarehouse(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.TENANCY_POS_DEVICES_VIEW)
  @Get('pos-devices')
  listPosDevices(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.tenancyService.listPosDevices(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.TENANCY_POS_DEVICES_MANAGE)
  @Post('pos-devices')
  createPosDevice(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePosDeviceDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.tenancyService.createPosDevice(tx, user.companyId, user.userId, dto),
    );
  }
}
