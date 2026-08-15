import { Injectable } from '@nestjs/common';
import { AuthLookupPrismaService } from '../../common/prisma/auth-lookup-prisma.service';

export interface MembershipOption {
  membershipId: string;
  companyId: string;
  companyLegalName: string;
  companyTradeName: string | null;
}

/**
 * The only consumer of AuthLookupPrismaService. Resolves which companies a
 * user can act as (their active Memberships) *before* a tenant context
 * exists - see AuthLookupPrismaService for why this needs its own DB role.
 * Credential verification itself no longer needs this: `users` carries no
 * RLS since the identity refactor, so AuthService reads it via the normal
 * PrismaService directly.
 */
@Injectable()
export class AuthLookupService {
  constructor(private readonly authLookupPrisma: AuthLookupPrismaService) {}

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
