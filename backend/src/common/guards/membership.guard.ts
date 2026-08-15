import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Runs after JwtAuthGuard, before PermissionsGuard. Confirms the Membership
 * the access token was minted for is still active - closes the gap where a
 * membership gets suspended mid-session but the (short-lived) access token
 * is still technically valid. Independent of permission checks: this fires
 * even on endpoints with no @RequirePermissions at all, so a suspended
 * membership loses all access immediately on its next request, not just
 * access to permission-gated routes.
 */
@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      return true; // no user on a non-public route means JwtAuthGuard will already reject it
    }

    const membership = await this.prisma.withTenant(user.companyId, (tx) =>
      tx.membership.findFirst({
        where: { id: user.membershipId, companyId: user.companyId, userId: user.userId },
      }),
    );

    if (!membership || membership.status !== 'active') {
      throw new ForbiddenException('العضوية في هذه المنشأة غير نشطة');
    }

    return true;
  }
}
