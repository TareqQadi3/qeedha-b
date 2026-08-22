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

export interface CompanyLookup {
  id: string;
  legalName: string;
  tradeName: string | null;
  status: string;
}

export interface BranchOption {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
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
 *
 * Phase 12 adds a third: resolving a Company by its subscriptionNumber
 * (owner login's 3rd identifier, and the entry point for employee login),
 * listing that company's branches for the employee-login dropdown, and
 * finding its Owner membership/checking a membership's branch scope - all
 * before any tenant context exists. See
 * prisma/manual-sql/007_auth_lookup_role_phase12.sql.
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

  /** Owner-login's 3rd identifier (email/mobile/subscriptionNumber) and the entry point for employee login. */
  async findCompanyBySubscriptionNumber(subscriptionNumber: number): Promise<CompanyLookup | null> {
    return this.authLookupPrisma.company.findFirst({
      where: { subscriptionNumber },
      select: { id: true, legalName: true, tradeName: true, status: true },
    });
  }

  /** For the employee-login branch dropdown, once a company was resolved by subscriptionNumber. */
  async listActiveBranchesForCompany(companyId: string): Promise<BranchOption[]> {
    return this.authLookupPrisma.branch.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true, code: true, isDefault: true },
      orderBy: { isDefault: 'desc' },
    });
  }

  /**
   * The one active Membership holding the system Owner role at company
   * scope (branchId null) for this company - resolves owner login via
   * subscriptionNumber. Returns null both when there is none (shouldn't
   * happen for a real company) and when there is more than one (co-owner
   * setups this schema allows but subscriptionNumber login can't safely
   * disambiguate) - either way the caller falls back to "use email/mobile
   * instead" rather than guessing.
   */
  async findSoleOwnerUserIdForCompany(companyId: string): Promise<string | null> {
    const ownerScopes = await this.authLookupPrisma.membershipRole.findMany({
      where: { companyId, branchId: null, role: { name: 'Owner' } },
      select: { membershipId: true },
    });
    const membershipIds = [...new Set(ownerScopes.map((r) => r.membershipId))];
    if (membershipIds.length !== 1) {
      return null;
    }
    const membership = await this.authLookupPrisma.membership.findFirst({
      where: { id: membershipIds[0], status: 'active' },
      select: { userId: true },
    });
    return membership?.userId ?? null;
  }

  /** The active Membership (if any) linking this user to this company - employee login needs its id/status before a tenant context exists. */
  async findActiveMembership(
    companyId: string,
    userId: string,
  ): Promise<{ id: string; status: string } | null> {
    return this.authLookupPrisma.membership.findFirst({
      where: { companyId, userId },
      select: { id: true, status: true },
    });
  }

  /** branchId of every role this membership holds - null means "whole company", used to authorize the branch picked at employee login. */
  async listMembershipRoleBranchScopes(membershipId: string): Promise<(string | null)[]> {
    const rows = await this.authLookupPrisma.membershipRole.findMany({
      where: { membershipId },
      select: { branchId: true },
    });
    return rows.map((r) => r.branchId);
  }
}
