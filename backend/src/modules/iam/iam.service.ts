import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';

/** Never let passwordHash leave this module through an API response. User carries no company_id - see docs/DOMAIN_MODEL.md. */
const SAFE_USER_SELECT = {
  id: true,
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

  /**
   * Attaches a person to this company as a new Membership. If the
   * email/mobile already belongs to an existing global User (they already
   * have an account - possibly in a different company), that identity is
   * reused as-is: no password change, no fullName overwrite. Only a
   * genuinely new identity gets created here, and only then is `password`
   * required.
   */
  async createUser(tx: TenantClient, companyId: string, actorUserId: string, dto: CreateUserDto) {
    const identifierFilters = [
      ...(dto.email ? [{ email: dto.email }] : []),
      ...(dto.mobile ? [{ mobile: dto.mobile }] : []),
    ];
    let user = identifierFilters.length
      ? await tx.user.findFirst({
          where: { deletedAt: null, OR: identifierFilters },
          select: SAFE_USER_SELECT,
        })
      : null;

    let isNewUser = false;
    if (!user) {
      if (!dto.password) {
        throw new BadRequestException(
          'كلمة المرور مطلوبة عند إنشاء حساب جديد لا يملك عضوية في أي منشأة بعد',
        );
      }
      const passwordHash = await argon2.hash(dto.password);
      user = await tx.user.create({
        data: { fullName: dto.fullName, email: dto.email, mobile: dto.mobile, passwordHash },
        select: SAFE_USER_SELECT,
      });
      isNewUser = true;
    } else {
      const existingMembership = await tx.membership.findFirst({
        where: { userId: user.id, companyId },
      });
      if (existingMembership) {
        throw new ConflictException('هذا المستخدم لديه عضوية بالفعل في هذه المنشأة');
      }
    }

    const membership = await tx.membership.create({
      data: { companyId, userId: user.id, status: 'active' },
    });

    let membershipRole = null;
    if (dto.roleId) {
      membershipRole = await this.assignRole(tx, companyId, actorUserId, {
        userId: user.id,
        roleId: dto.roleId,
        branchId: dto.branchId,
      });
    }

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: isNewUser ? 'iam.user.create' : 'iam.user.attach_existing',
      entityType: 'Membership',
      entityId: membership.id,
      afterState: {
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        isNewUser,
      },
    });

    return { user, membership, membershipRole };
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

  /** Everyone with a Membership in this company, and their roles within it. */
  async listUsers(tx: TenantClient, companyId: string, query: QueryUsersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where = { companyId };
    const [memberships, total] = await Promise.all([
      tx.membership.findMany({
        where,
        include: {
          user: { select: SAFE_USER_SELECT },
          membershipRoles: { include: { role: true, branch: true } },
        },
        orderBy: { user: { fullName: 'asc' } },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.membership.count({ where }),
    ]);

    const data = memberships.map((m) => ({
      membershipId: m.id,
      membershipStatus: m.status,
      ...m.user,
      roles: m.membershipRoles.map((mr) => ({
        membershipRoleId: mr.id,
        name: mr.role.name,
        branch: mr.branch?.name ?? null,
      })),
    }));

    return paginate(data, total, page, pageSize);
  }

  /**
   * `params.userId` is the global User id (what the API surfaces, since an
   * admin thinks "assign this person a role", not "this membership id").
   * Resolved to the Membership for (userId, companyId) internally - a role
   * is always granted within a specific Membership, never to a user
   * globally (docs/DOMAIN_MODEL.md).
   */
  async assignRole(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    params: { userId: string; roleId: string; branchId?: string | null },
  ) {
    const [membership, role] = await Promise.all([
      tx.membership.findFirst({ where: { userId: params.userId, companyId, status: 'active' } }),
      tx.role.findFirst({
        where: { id: params.roleId, OR: [{ companyId: null }, { companyId }] },
      }),
    ]);
    if (!membership) throw new NotFoundException('لا توجد عضوية نشطة لهذا المستخدم في هذه المنشأة');
    if (!role) throw new NotFoundException('الدور غير موجود');

    if (params.branchId) {
      const branch = await tx.branch.findFirst({
        where: { id: params.branchId, companyId, deletedAt: null },
      });
      if (!branch) throw new NotFoundException('الفرع غير موجود');
    }

    const existing = await tx.membershipRole.findFirst({
      where: {
        membershipId: membership.id,
        roleId: params.roleId,
        branchId: params.branchId ?? null,
      },
    });
    if (existing) {
      throw new ConflictException('هذا الدور مُسنَد بالفعل لهذا المستخدم ضمن هذا النطاق');
    }

    const membershipRole = await tx.membershipRole.create({
      data: {
        companyId,
        membershipId: membership.id,
        roleId: params.roleId,
        branchId: params.branchId ?? null,
      },
      include: { role: true, branch: true },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'iam.membership_role.assign',
      entityType: 'MembershipRole',
      entityId: membershipRole.id,
      afterState: {
        userId: params.userId,
        roleName: membershipRole.role.name,
        branchId: params.branchId ?? null,
      },
    });

    return membershipRole;
  }

  async revokeRole(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    membershipRoleId: string,
  ) {
    const membershipRole = await tx.membershipRole.findFirst({
      where: { id: membershipRoleId, companyId },
      include: { role: true, membership: true },
    });
    if (!membershipRole) throw new NotFoundException('إسناد الدور غير موجود');

    await tx.membershipRole.delete({ where: { id: membershipRoleId } });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'iam.membership_role.revoke',
      entityType: 'MembershipRole',
      entityId: membershipRoleId,
      beforeState: { userId: membershipRole.membership.userId, roleName: membershipRole.role.name },
    });

    return { success: true };
  }

  /**
   * Every permission key held by this Membership - i.e. this user, in this
   * company, across every role assignment (company-wide scope and every
   * branch scope combined). Phase 1/2 permission checks are scope-agnostic
   * ("does the user have this permission anywhere in this company");
   * branch-scoped enforcement is added once actual branch-scoped resources
   * exist (POS sales, branch inventory).
   */
  async getEffectivePermissionKeys(tx: TenantClient, membershipId: string): Promise<Set<string>> {
    const membershipRoles = await tx.membershipRole.findMany({
      where: { membershipId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    const keys = new Set<string>();
    for (const membershipRole of membershipRoles) {
      for (const rp of membershipRole.role.rolePermissions) {
        keys.add(rp.permission.key);
      }
    }
    return keys;
  }
}
