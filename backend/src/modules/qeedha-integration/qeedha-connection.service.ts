import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TenantClient } from '../../common/prisma/prisma.service';
import { hashToken } from '../../common/utils/token-hash';
import { AuditService } from '../audit/audit.service';
import {
  INTEGRATION_PUBLIC_REFERENCE_PREFIX,
  INTEGRATION_SYSTEM_ROLE_NAME,
  INTEGRATION_SYSTEM_USER_EMAIL,
  QEEDHA_PROVIDER_KEY,
} from './constants/qeedha-integration.constants';

/**
 * Merchant-facing lifecycle for the ONE `IntegrationConnection` row a
 * company can hold against providerKey='qeedha' - link (mint a secret,
 * shown exactly once), status, revoke. JWT-authenticated, RLS-protected,
 * fully separate from the external-facing QeedhaTransactionService (which
 * authenticates via the secret this service mints, never via a JWT).
 *
 * Deliberately NOT built on the generic `IntegrationsService.connect()` -
 * that method's contract is "fail unless a PaymentIntegrationPort adapter
 * is registered" (an OUTBOUND capability that genuinely doesn't exist for
 * any provider yet - see docs/INTEGRATION.md). Minting an INBOUND API
 * credential is a different operation in kind, so it gets its own method
 * here while still reusing the SAME underlying `IntegrationConnection`/
 * `IntegrationProvider` rows - see docs/QEEDHA_INTEGRATION.md "Two
 * directions, one connection model".
 */
@Injectable()
export class QeedhaConnectionService {
  constructor(private readonly auditService: AuditService) {}

  async getStatus(tx: TenantClient, companyId: string) {
    const connection = await tx.integrationConnection.findUnique({
      where: { companyId_providerKey: { companyId, providerKey: QEEDHA_PROVIDER_KEY } },
    });
    if (!connection) {
      return { status: 'not_connected' as const };
    }
    return this.toSafeView(connection);
  }

  /**
   * Mints a brand-new secret every call - the FIRST call links the
   * connection, any SUBSEQUENT call rotates it (the old secret stops
   * working immediately since only the current hash is ever compared).
   * The raw secret is returned exactly once here and never persisted
   * anywhere in recoverable form - only `secretHash` (SHA-256, same
   * `hashToken` used for refresh tokens) and `secretLastFour` (safe display)
   * are stored.
   */
  async link(tx: TenantClient, companyId: string, actorUserId: string) {
    const provider = await tx.integrationProvider.findUnique({
      where: { key: QEEDHA_PROVIDER_KEY },
    });
    if (!provider) {
      throw new InternalServerErrorException(
        'مزوّد تكامل قيّدها غير مسجَّل في الكتالوج - تأكد من تشغيل prisma db seed',
      );
    }

    const systemMembershipId = await this.ensureSystemMembership(tx, companyId);

    const secret = randomBytes(32).toString('hex');
    const publicReference = `${INTEGRATION_PUBLIC_REFERENCE_PREFIX}${randomBytes(12).toString('hex')}`;

    const existing = await tx.integrationConnection.findUnique({
      where: { companyId_providerKey: { companyId, providerKey: QEEDHA_PROVIDER_KEY } },
    });

    const connection = await tx.integrationConnection.upsert({
      where: { companyId_providerKey: { companyId, providerKey: QEEDHA_PROVIDER_KEY } },
      update: {
        status: 'connected',
        publicReference,
        secretHash: hashToken(secret),
        secretLastFour: secret.slice(-4),
        systemMembershipId,
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
        revokedAt: null,
      },
      create: {
        companyId,
        providerKey: QEEDHA_PROVIDER_KEY,
        status: 'connected',
        publicReference,
        secretHash: hashToken(secret),
        secretLastFour: secret.slice(-4),
        systemMembershipId,
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: existing
        ? 'qeedha_integration.connection.rotate'
        : 'qeedha_integration.connection.link',
      entityType: 'IntegrationConnection',
      entityId: connection.id,
      afterState: { publicReference, status: connection.status },
    });

    return { ...this.toSafeView(connection), secret, publicReference };
  }

  async revoke(tx: TenantClient, companyId: string, actorUserId: string) {
    const connection = await tx.integrationConnection.findUnique({
      where: { companyId_providerKey: { companyId, providerKey: QEEDHA_PROVIDER_KEY } },
    });
    if (!connection || connection.status !== 'connected') {
      throw new NotFoundException('لا يوجد ربط نشط لتكامل قيّدها');
    }

    const updated = await tx.integrationConnection.update({
      where: { id: connection.id },
      data: { status: 'disabled', secretHash: null, revokedAt: new Date() },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'qeedha_integration.connection.revoke',
      entityType: 'IntegrationConnection',
      entityId: connection.id,
      beforeState: { status: connection.status },
      afterState: { status: updated.status },
    });

    return this.toSafeView(updated);
  }

  /**
   * The non-human "Integration" system Membership every company's Qeedha
   * connection shares as its actor for business calls (recordExternalPayment,
   * customer creation) - reuses Membership/RBAC/BranchScopeService/Audit
   * exactly like a real user would, instead of special-casing "no actor" in
   * SalesService/CustomersService. See docs/QEEDHA_INTEGRATION.md
   * "System actor". Idempotent: safe to call on every link/rotate.
   */
  private async ensureSystemMembership(tx: TenantClient, companyId: string): Promise<string> {
    const systemUser = await tx.user.findUnique({
      where: { email: INTEGRATION_SYSTEM_USER_EMAIL },
    });
    if (!systemUser) {
      throw new InternalServerErrorException(
        'هوية نظام تكامل قيّدها غير موجودة - تأكد من تشغيل prisma db seed',
      );
    }

    const integrationRole = await tx.role.findFirst({
      where: { companyId: null, name: INTEGRATION_SYSTEM_ROLE_NAME },
    });
    if (!integrationRole) {
      throw new InternalServerErrorException(
        'الدور النظامي Integration غير موجود - تأكد من تشغيل prisma db seed',
      );
    }

    let membership = await tx.membership.findUnique({
      where: { companyId_userId: { companyId, userId: systemUser.id } },
    });
    if (!membership) {
      membership = await tx.membership.create({
        data: { companyId, userId: systemUser.id, status: 'active' },
      });
    } else if (membership.status !== 'active') {
      membership = await tx.membership.update({
        where: { id: membership.id },
        data: { status: 'active' },
      });
    }

    const existingRole = await tx.membershipRole.findFirst({
      where: { membershipId: membership.id, roleId: integrationRole.id, branchId: null },
    });
    if (!existingRole) {
      await tx.membershipRole.create({
        data: {
          companyId,
          membershipId: membership.id,
          roleId: integrationRole.id,
          branchId: null,
        },
      });
    }

    return membership.id;
  }

  private toSafeView(connection: {
    status: string;
    publicReference: string | null;
    secretLastFour: string | null;
    connectedAt: Date | null;
    lastVerifiedAt: Date | null;
    revokedAt: Date | null;
  }) {
    return {
      status: connection.status,
      publicReference: connection.publicReference,
      secretLastFour: connection.secretLastFour,
      connectedAt: connection.connectedAt,
      lastVerifiedAt: connection.lastVerifiedAt,
      revokedAt: connection.revokedAt,
    };
  }
}
