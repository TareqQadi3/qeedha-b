import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TenantClient } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { IntegrationRegistry } from './integration-registry.service';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly registry: IntegrationRegistry,
    private readonly auditService: AuditService,
  ) {}

  listProviders(tx: TenantClient) {
    return tx.integrationProvider.findMany({ orderBy: { name: 'asc' } });
  }

  listConnections(tx: TenantClient, companyId: string) {
    return tx.integrationConnection.findMany({
      where: { companyId },
      include: { provider: true },
      orderBy: { providerKey: 'asc' },
    });
  }

  async connect(tx: TenantClient, companyId: string, actorUserId: string, providerKey: string) {
    const provider = await tx.integrationProvider.findUnique({ where: { key: providerKey } });
    if (!provider) {
      throw new NotFoundException('هذا التكامل غير مسجَّل في الكتالوج');
    }

    const adapter = this.registry.get(providerKey);
    if (!adapter) {
      throw new UnprocessableEntityException(
        'لا يوجد Adapter فعلي مسجَّل لهذا التكامل بعد في هذا الإصدار - ' +
          'البنية جاهزة لاستقباله عند توفره',
      );
    }

    const connection = await tx.integrationConnection.upsert({
      where: { companyId_providerKey: { companyId, providerKey } },
      update: { status: 'connected', connectedAt: new Date(), lastVerifiedAt: new Date() },
      create: {
        companyId,
        providerKey,
        status: 'connected',
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'integrations.connection.connect',
      entityType: 'IntegrationConnection',
      entityId: connection.id,
      afterState: { providerKey, status: connection.status },
    });

    return connection;
  }

  async disconnect(tx: TenantClient, companyId: string, actorUserId: string, providerKey: string) {
    const connection = await tx.integrationConnection.findUnique({
      where: { companyId_providerKey: { companyId, providerKey } },
    });
    if (!connection) {
      throw new NotFoundException('لا يوجد ربط قائم لهذا التكامل');
    }

    const updated = await tx.integrationConnection.update({
      where: { id: connection.id },
      data: { status: 'disabled' },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'integrations.connection.disconnect',
      entityType: 'IntegrationConnection',
      entityId: connection.id,
      beforeState: { status: connection.status },
      afterState: { status: updated.status },
    });

    return updated;
  }
}
