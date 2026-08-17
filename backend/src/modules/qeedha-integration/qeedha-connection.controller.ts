import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { QeedhaConnectionService } from './qeedha-connection.service';

/**
 * Merchant-facing (JWT-authenticated, same guard chain as everything else -
 * RBAC/RLS/subscription entitlement all apply normally). Section 3
 * ("secure token linking flow rather than requiring the merchant to
 * manually paste arbitrary API keys"): the merchant never types a secret in
 * - `link` MINTS one and shows it exactly once in the response.
 */
@Controller('qeedha-integration/connection')
export class QeedhaConnectionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectionService: QeedhaConnectionService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.INTEGRATION_READ)
  @Get()
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.connectionService.getStatus(tx, user.companyId),
    );
  }

  /** Sensitive/rare action (mints a credential) - throttled tighter than the general default (100/60s), same order of magnitude as AuthController's own registration limit (also a rare, setup-time action). */
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @RequirePermissions(PERMISSION_KEYS.INTEGRATION_MANAGE)
  @Post()
  link(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.connectionService.link(tx, user.companyId, user.userId),
    );
  }

  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION_KEYS.INTEGRATION_MANAGE)
  @Delete()
  revoke(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.connectionService.revoke(tx, user.companyId, user.userId),
    );
  }
}
