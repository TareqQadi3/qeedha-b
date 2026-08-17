import { Injectable } from '@nestjs/common';
import { AuthLookupPrismaService } from '../../common/prisma/auth-lookup-prisma.service';

export interface MembershipOption {
  membershipId: string;
  companyId: string;
  companyLegalName: string;
  companyTradeName: string | null;
}

export interface IntegrationConnectionLookup {
  id: string;
  companyId: string;
  providerKey: string;
  publicReference: string | null;
  secretHash: string | null;
  status: string;
  systemMembershipId: string | null;
}

/**
 * The only consumer of AuthLookupPrismaService. Resolves which companies a
 * user can act as (their active Memberships) *before* a tenant context
 * exists - see AuthLookupPrismaService for why this needs its own DB role.
 * Credential verification itself no longer needs this: `users` carries no
 * RLS since the identity refactor, so AuthService reads it via the normal
 * PrismaService directly.
 *
 * Milestone 9 adds a second, structurally identical bootstrap problem:
 * QeedhaIntegrationAuthGuard must resolve an `IntegrationConnection` by its
 * `publicReference` before it knows which company/tenant the request is
 * even for - see prisma/manual-sql/003_auth_lookup_role_integration.sql.
 */
@Injectable()
export class AuthLookupService {
  constructor(private readonly authLookupPrisma: AuthLookupPrismaService) {}

  async findIntegrationConnectionByPublicReference(
    publicReference: string,
  ): Promise<IntegrationConnectionLookup | null> {
    return this.authLookupPrisma.integrationConnection.findFirst({
      where: { publicReference },
      select: {
        id: true,
        companyId: true,
        providerKey: true,
        publicReference: true,
        secretHash: true,
        status: true,
        systemMembershipId: true,
      },
    });
  }

  async listActiveMembershipsForUser(userId: string): Promise<MembershipOption[]> {
    const memberships = await this.authLookupPrisma.membership.findMany({
      where: { userId, status: 'active' },
      select: { id: true, companyId: true },
    });
    if (memberships.length === 0) {
      return [];
    }

    const companies = await this.authLookupPrisma.company.findMany({
      where: { id: { in: memberships.map((m) => m.companyId) }, status: 'active' },
      select: { id: true, legalName: true, tradeName: true },
    });
    const companyById = new Map(companies.map((c) => [c.id, c]));

    return memberships
      .filter((m) => companyById.has(m.companyId))
      .map((m) => {
        const company = companyById.get(m.companyId)!;
        return {
          membershipId: m.id,
          companyId: m.companyId,
          companyLegalName: company.legalName,
          companyTradeName: company.tradeName,
        };
      });
  }
}
