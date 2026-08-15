import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { TenantClient } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';

/** Never let passwordHash leave this module through an API response. */
const SAFE_USER_SELECT = {
  id: true,
  companyId: true,
  fullName: true,
  email: true,
  mobile: true,
  status: true,
  locale: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class IamService {
  constructor(private readonly auditService: AuditService) {}

  async createUser(tx: TenantClient, companyId: string, actorUserId: string, dto: CreateUserDto) {
    const passwordHash = await argon2.hash(dto.password);
    const user = await tx.user.create({
      data: {
        companyId,
        fullName: dto.fullName,
        email: dto.email,
        mobile: dto.mobile,
        passwordHash,
      },
      select: SAFE_USER_SELECT,
    });

    let userRole = null;
    if (dto.roleId) {
      userRole = await this.assignRole(tx, companyId, actorUserId, {
        userId: user.id,
        roleId: dto.roleId,
        branchId: dto.branchId,
      });
    }

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'iam.user.create',
      entityType: 'User',
      entityId: user.id,
      afterState: { fullName: user.fullName, email: user.email, mobile: user.mobile },
    });

    return { user, userRole };
  }

  async listPermissions(tx: TenantClient) {
    return tx.permission.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] });
  }

  /** System roles (company-wide) plus this tenant's own custom roles. */
  async listRoles(tx: TenantClient, companyId: string) {
    return tx.role.findMany({
      where: { OR: [{ companyId: null }, { companyId }] },
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async listUsers(tx: TenantClient, companyId: string) {
    return tx.user.findMany({
      where: { companyId, deletedAt: null },
      select: {
        ...SAFE_USER_SELECT,
        userRoles: { include: { role: true, branch: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async assignRole(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    params: { userId: string; roleId: string; branchId?: string | null },
  ) {
    const [user, role] = await Promise.all([
      tx.user.findFirst({ where: { id: params.userId, companyId, deletedAt: null } }),
      tx.role.findFirst({
        where: { id: params.roleId, OR: [{ companyId: null }, { companyId }] },
      }),
    ]);
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (!role) throw new NotFoundException('الدور غير موجود');

    if (params.branchId) {
      const branch = await tx.branch.findFirst({
        where: { id: params.branchId, companyId, deletedAt: null },
      });
      if (!branch) throw new NotFoundException('الفرع غير موجود');
    }

    const existing = await tx.userRole.findFirst({
      where: { userId: params.userId, roleId: params.roleId, branchId: params.branchId ?? null },
    });
    if (existing) {
      throw new ConflictException('هذا الدور مُسنَد بالفعل لهذا المستخدم ضمن هذا النطاق');
    }

    const userRole = await tx.userRole.create({
      data: {
        companyId,
        userId: params.userId,
        roleId: params.roleId,
        branchId: params.branchId ?? null,
      },
      include: { role: true, branch: true },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'iam.user_role.assign',
      entityType: 'UserRole',
      entityId: userRole.id,
      afterState: {
        userId: params.userId,
        roleName: userRole.role.name,
        branchId: params.branchId ?? null,
      },
    });

    return userRole;
  }

  async revokeRole(tx: TenantClient, companyId: string, actorUserId: string, userRoleId: string) {
    const userRole = await tx.userRole.findFirst({
      where: { id: userRoleId, companyId },
      include: { role: true },
    });
    if (!userRole) throw new NotFoundException('إسناد الدور غير موجود');

    await tx.userRole.delete({ where: { id: userRoleId } });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'iam.user_role.revoke',
      entityType: 'UserRole',
      entityId: userRoleId,
      beforeState: { userId: userRole.userId, roleName: userRole.role.name },
    });

    return { success: true };
  }

  /**
   * Every permission key the user holds, across all their role assignments
   * for this company (company-wide scope and every branch scope combined).
   * Phase 1 permission checks are scope-agnostic ("does the user have this
   * permission anywhere"); branch-scoped enforcement is added once actual
   * branch-scoped resources exist (POS sales, branch inventory) in later
   * phases.
   */
  async getEffectivePermissionKeys(
    tx: TenantClient,
    userId: string,
    companyId: string,
  ): Promise<Set<string>> {
    const userRoles = await tx.userRole.findMany({
      where: { userId, companyId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    const keys = new Set<string>();
    for (const userRole of userRoles) {
      for (const rp of userRole.role.rolePermissions) {
        keys.add(rp.permission.key);
      }
    }
    return keys;
  }
}
