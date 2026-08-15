import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from './constants/permissions';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { IamService } from './iam.service';

@Controller('iam')
export class IamController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iamService: IamService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.IAM_ROLES_VIEW)
  @Get('roles')
  listRoles(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.iamService.listRoles(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.IAM_ROLES_VIEW)
  @Get('permissions')
  listPermissions(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) => this.iamService.listPermissions(tx));
  }

  @RequirePermissions(PERMISSION_KEYS.IAM_USERS_VIEW)
  @Get('users')
  listUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.iamService.listUsers(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.IAM_USERS_MANAGE)
  @Post('users')
  createUser(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.iamService.createUser(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.IAM_USERS_MANAGE)
  @Post('users/:id/roles')
  assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') targetUserId: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.iamService.assignRole(tx, user.companyId, user.userId, {
        userId: targetUserId,
        roleId: dto.roleId,
        branchId: dto.branchId,
      }),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.IAM_USERS_MANAGE)
  @Delete('users/:id/roles/:userRoleId')
  revokeRole(@CurrentUser() user: AuthenticatedUser, @Param('userRoleId') userRoleId: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.iamService.revokeRole(tx, user.companyId, user.userId, userRoleId),
    );
  }
}
