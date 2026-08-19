import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformAdminRole } from '@prisma/client';
import { AuthenticatedPlatformAdmin } from './platform-admin-auth.guard';
import { PLATFORM_ADMIN_ROLES_KEY } from './require-platform-admin-role.decorator';

/**
 * Runs after PlatformAdminAuthGuard (which must populate
 * request.platformAdmin.role - see platform-admin-auth.guard.ts). Control
 * Center RBAC (Website phase spec "Staff / Admin Users" - "Do not give
 * every employee full admin access"): `admin` always passes, any other
 * required role must exactly match the authenticated admin's own role.
 */
@Injectable()
export class PlatformAdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PlatformAdminRole[]>(
      PLATFORM_ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const admin = request.platformAdmin as AuthenticatedPlatformAdmin | undefined;
    if (!admin) throw new ForbiddenException('غير مصرح');

    if (admin.role === 'admin' || required.includes(admin.role)) {
      return true;
    }
    throw new ForbiddenException('لا تملك صلاحية الوصول لهذا القسم من مركز التحكم');
  }
}
