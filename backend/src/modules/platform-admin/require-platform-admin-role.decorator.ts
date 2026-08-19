import { SetMetadata } from '@nestjs/common';
import { PlatformAdminRole } from '@prisma/client';

export const PLATFORM_ADMIN_ROLES_KEY = 'platformAdminRoles';

/**
 * Restricts a Control Center route to specific PlatformAdminRole values -
 * `admin` always passes regardless of the list (see PlatformAdminRoleGuard),
 * matching the spec's "Admin → everything" example exactly. A route with
 * no decorator is reachable by any authenticated platform admin
 * (PlatformAdminAuthGuard alone already gates that).
 */
export const RequirePlatformAdminRole = (...roles: PlatformAdminRole[]) =>
  SetMetadata(PLATFORM_ADMIN_ROLES_KEY, roles);
