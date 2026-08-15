import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../../iam/constants/permissions';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationsService: IntegrationsService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.SETTINGS_INTEGRATIONS_VIEW)
  @Get('providers')
  listProviders(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.integrationsService.listProviders(tx),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.SETTINGS_INTEGRATIONS_VIEW)
  @Get('connections')
  listConnections(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.integrationsService.listConnections(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.SETTINGS_INTEGRATIONS_MANAGE)
  @Post('connections/:providerKey/connect')
  connect(@CurrentUser() user: AuthenticatedUser, @Param('providerKey') providerKey: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.integrationsService.connect(tx, user.companyId, user.userId, providerKey),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.SETTINGS_INTEGRATIONS_MANAGE)
  @Post('connections/:providerKey/disconnect')
  disconnect(@CurrentUser() user: AuthenticatedUser, @Param('providerKey') providerKey: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.integrationsService.disconnect(tx, user.companyId, user.userId, providerKey),
    );
  }
}
