import { Injectable } from '@nestjs/common';
import { TenantClient } from '../../common/prisma/prisma.service';

export interface BranchScope {
  /** true = no branch restriction; every branch in this membership's company is authorized for this permission. */
  allBranches: boolean;
  /** Only meaningful when allBranches is false. */
  branchIds: Set<string>;
}

/**
 * Reads MembershipRole.branchId (docs/DOMAIN_MODEL.md "Branch & Warehouse
 * Authorization Scope") per-permission: which branches does THIS
 * membership's grant of THIS specific permission apply to? A membership can
 * hold the same permission from more than one role assignment (e.g.
 * company-wide from one role, branch-scoped from another) - if ANY
 * assignment is company-wide (branchId = null), the union is company-wide.
 * PermissionsGuard still answers "does this membership hold this permission
 * anywhere in the company" (unchanged); this answers the narrower "in which
 * branches" question, asked only by call sites that touch a branch-owned
 * resource (currently: inventory/warehouse operations).
 */
@Injectable()
export class BranchScopeService {
  async getScopeForPermission(
    tx: TenantClient,
    membershipId: string,
    permissionKey: string,
  ): Promise<BranchScope> {
    const membershipRoles = await tx.membershipRole.findMany({
      where: {
        membershipId,
        role: { rolePermissions: { some: { permission: { key: permissionKey } } } },
      },
      select: { branchId: true },
    });

    const branchIds = new Set<string>();
    for (const mr of membershipRoles) {
      if (mr.branchId === null) {
        return { allBranches: true, branchIds: new Set() };
      }
      branchIds.add(mr.branchId);
    }
    return { allBranches: false, branchIds };
  }
}
