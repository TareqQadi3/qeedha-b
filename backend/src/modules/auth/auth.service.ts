import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'crypto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashToken } from '../../common/utils/token-hash';
import { parseDurationMs } from '../../common/utils/duration';
import { IamService } from '../iam/iam.service';
import { AuthLookupService } from './auth-lookup.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { SelectTenantDto } from './dto/select-tenant.dto';

const OWNER_ROLE_NAME = 'Owner';
const TENANT_SELECTION_PURPOSE = 'tenant_selection';

interface TenantSelectionPayload {
  sub: string; // userId
  purpose: typeof TENANT_SELECTION_PURPOSE;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authLookupService: AuthLookupService,
    private readonly iamService: IamService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async registerCompany(dto: RegisterCompanyDto) {
    const passwordHash = await argon2.hash(dto.password);

    // Ids are pre-generated so we can open the RLS tenant transaction for
    // this brand-new company before any row exists yet - see
    // PrismaService.withTenant.
    const companyId = randomUUID();
    const branchId = randomUUID();
    const warehouseId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();

    const { user, membership } = await this.prisma.withTenant(companyId, async (tx) => {
      await tx.company.create({
        data: {
          id: companyId,
          legalName: dto.legalName,
          tradeName: dto.tradeName,
          vatNumber: dto.vatNumber,
          crNumber: dto.crNumber,
        },
      });

      const branch = await tx.branch.create({
        data: {
          id: branchId,
          companyId,
          name: dto.branchName ?? 'الفرع الرئيسي',
          code: 'MAIN',
          isDefault: true,
        },
      });

      await tx.warehouse.create({
        data: {
          id: warehouseId,
          companyId,
          branchId: branch.id,
          name: 'المستودع الرئيسي',
          code: 'MAIN',
          isDefault: true,
        },
      });

      // Global identity: created fresh here since this flow always
      // registers a brand-new owner. IamService.createUser handles the
      // "attach an existing person to another company" case for invites.
      const user = await tx.user.create({
        data: {
          id: userId,
          fullName: dto.ownerFullName,
          email: dto.ownerEmail,
          mobile: dto.ownerMobile,
          passwordHash,
        },
      });

      const membership = await tx.membership.create({
        data: { id: membershipId, companyId, userId: user.id, status: 'active' },
      });

      const ownerRole = await tx.role.findFirst({
        where: { companyId: null, name: OWNER_ROLE_NAME },
      });
      if (!ownerRole) {
        throw new InternalServerErrorException(
          'دور Owner النظامي غير موجود - تأكد من تشغيل prisma db seed قبل التسجيل',
        );
      }

      await tx.membershipRole.create({
        data: { companyId, membershipId: membership.id, roleId: ownerRole.id, branchId: null },
      });

      return { user, membership };
    });

    const tokens = await this.issueTokens(user.id, membership.id, companyId);
    return {
      company: { id: companyId, legalName: dto.legalName },
      user: { id: user.id, fullName: user.fullName, email: user.email, mobile: user.mobile },
      activeTenant: { companyId, membershipId: membership.id },
      ...tokens,
    };
  }

  /**
   * Two shapes of response, both intentional (see docs/DOMAIN_MODEL.md
   * "Login and tenant selection"):
   *  - Exactly one active Membership: tokens are issued immediately for
   *    that tenant - no unnecessary selection screen for the common case.
   *  - Two or more: a short-lived tenantSelectionToken is returned instead
   *    of real tokens, alongside the list of companies to choose from.
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: dto.identifier }, { mobile: dto.identifier }],
      },
    });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const memberships = await this.authLookupService.listActiveMembershipsForUser(user.id);

    if (memberships.length === 0) {
      throw new ForbiddenException('لا توجد منشأة نشطة مرتبطة بهذا الحساب');
    }

    if (memberships.length === 1) {
      const [membership] = memberships;
      const tokens = await this.issueTokens(user.id, membership.membershipId, membership.companyId);
      return {
        user: this.toSafeUser(user),
        activeTenant: {
          companyId: membership.companyId,
          membershipId: membership.membershipId,
          companyLegalName: membership.companyLegalName,
        },
        ...tokens,
      };
    }

    const tenantSelectionToken = this.issueTenantSelectionToken(user.id);
    return {
      tenantSelectionRequired: true,
      tenantSelectionToken,
      availableCompanies: memberships.map((m) => ({
        companyId: m.companyId,
        legalName: m.companyLegalName,
        tradeName: m.companyTradeName,
      })),
    };
  }

  /** Completes login for a user with multiple Memberships. */
  async selectTenant(dto: SelectTenantDto) {
    let payload: TenantSelectionPayload;
    try {
      payload = await this.jwtService.verifyAsync<TenantSelectionPayload>(
        dto.tenantSelectionToken,
        {
          secret: this.config.get<string>('JWT_TENANT_SELECTION_SECRET'),
        },
      );
    } catch {
      throw new UnauthorizedException('رمز اختيار المنشأة غير صالح أو منتهي الصلاحية');
    }
    if (payload.purpose !== TENANT_SELECTION_PURPOSE) {
      throw new UnauthorizedException('رمز غير صالح لهذا الغرض');
    }

    return this.completeTenantLogin(payload.sub, dto.companyId);
  }

  /**
   * Switches an already-authenticated session to a different company this
   * user also holds a Membership in - the "tenant switcher" extension point
   * called out in docs/DOMAIN_MODEL.md. Same authorization check as
   * selectTenant, just starting from a valid access token instead of a
   * tenant-selection token.
   */
  async switchTenant(userId: string, companyId: string) {
    return this.completeTenantLogin(userId, companyId);
  }

  /**
   * The one authorization check that matters for both selectTenant and
   * switchTenant: does this user actually hold an active Membership in the
   * requested company? Checked through the normal RLS-protected path (not
   * the bypass role) since the target tenant is already known - RLS
   * independently confirms the row truly belongs to companyId, on top of
   * the WHERE clause. Manual tenantId tampering (e.g. a client just sending
   * a different companyId) fails here, not by trusting the request.
   */
  private async completeTenantLogin(userId: string, companyId: string) {
    const membership = await this.prisma.withTenant(companyId, (tx) =>
      tx.membership.findFirst({ where: { userId, companyId, status: 'active' } }),
    );
    if (!membership) {
      throw new ForbiddenException('لا تملك عضوية صالحة في هذه المنشأة');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('الحساب غير نشط');
    }

    const tokens = await this.issueTokens(user.id, membership.id, companyId);
    return {
      user: this.toSafeUser(user),
      activeTenant: { companyId, membershipId: membership.id },
      ...tokens,
    };
  }

  async refresh(dto: RefreshDto) {
    const tokenHash = hashToken(dto.refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) {
      throw new UnauthorizedException('رمز التحديث غير صالح');
    }

    if (existing.revokedAt) {
      // Reuse of an already-rotated token is a strong signal of theft: kill
      // every active session for this user, not just this one.
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('تم إبطال الجلسة لأسباب أمنية، الرجاء تسجيل الدخول مجددًا');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('انتهت صلاحية رمز التحديث');
    }

    const tokens = await this.issueTokens(
      existing.userId,
      existing.membershipId,
      existing.companyId,
    );

    const newToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(tokens.refreshToken) },
    });
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByTokenId: newToken?.id },
    });

    return tokens;
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  async me(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, async (tx) => {
      const membership = await tx.membership.findFirst({
        where: {
          id: user.membershipId,
          companyId: user.companyId,
          userId: user.userId,
          status: 'active',
        },
        include: {
          user: true,
          membershipRoles: { include: { role: true, branch: true } },
        },
      });
      if (!membership) {
        throw new NotFoundException('العضوية غير موجودة');
      }

      const permissions = await this.iamService.getEffectivePermissionKeys(tx, user.membershipId);

      return {
        id: membership.user.id,
        fullName: membership.user.fullName,
        email: membership.user.email,
        mobile: membership.user.mobile,
        locale: membership.user.locale,
        companyId: user.companyId,
        membershipId: membership.id,
        roles: membership.membershipRoles.map((mr) => ({
          name: mr.role.name,
          branch: mr.branch?.name ?? null,
        })),
        permissions: Array.from(permissions),
      };
    });
  }

  /** All the companies this user could switch to - used to build a tenant switcher UI. */
  async listMyTenants(userId: string) {
    const memberships = await this.authLookupService.listActiveMembershipsForUser(userId);
    return memberships.map((m) => ({
      companyId: m.companyId,
      legalName: m.companyLegalName,
      tradeName: m.companyTradeName,
    }));
  }

  private toSafeUser(user: {
    id: string;
    fullName: string;
    email: string | null;
    mobile: string | null;
    locale: string;
  }) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      mobile: user.mobile,
      locale: user.locale,
    };
  }

  private issueTenantSelectionToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId, purpose: TENANT_SELECTION_PURPOSE },
      {
        secret: this.config.get<string>('JWT_TENANT_SELECTION_SECRET'),
        expiresIn: this.config.get<string>('JWT_TENANT_SELECTION_TTL'),
      },
    );
  }

  private async issueTokens(userId: string, membershipId: string, companyId: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, companyId, membershipId },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL'),
      },
    );

    const refreshTokenValue = randomBytes(48).toString('hex');
    const ttlMs = parseDurationMs(this.config.get<string>('JWT_REFRESH_TTL')!);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        membershipId,
        companyId,
        tokenHash: hashToken(refreshTokenValue),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }
}
