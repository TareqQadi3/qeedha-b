import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformAdminPrismaService } from '../../common/prisma/platform-admin-prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateCompanyByAdminDto } from './dto/create-company-by-admin.dto';
import { PlatformAdminLoginDto } from './dto/platform-admin-login.dto';

export const PLATFORM_ADMIN_JWT_SCOPE = 'platform_admin';

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAdminPrisma: PlatformAdminPrismaService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * `platform_admins` is global data with no RLS (same reasoning as
   * `users` post-identity-refactor - see docs/DOMAIN_MODEL.md), so the
   * normal app connection reads it directly. No AuthLookupPrismaService-
   * style bypass needed for this half; that's only for `companies`
   * (below), which stays RLS-FORCEd even for a platform admin.
   */
  async login(dto: PlatformAdminLoginDto) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email: dto.email } });
    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const passwordValid = await argon2.verify(admin.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const accessToken = this.jwtService.sign(
      { sub: admin.id, scope: PLATFORM_ADMIN_JWT_SCOPE },
      {
        secret: this.config.get<string>('JWT_PLATFORM_ADMIN_SECRET'),
        expiresIn: this.config.get<string>('JWT_PLATFORM_ADMIN_TTL'),
      },
    );

    return {
      accessToken,
      admin: { id: admin.id, fullName: admin.fullName, email: admin.email },
    };
  }

  async me(adminId: string) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedException('الحساب غير نشط');
    }
    return { id: admin.id, fullName: admin.fullName, email: admin.email };
  }

  /** Every company on the platform, across every tenant - see PlatformAdminPrismaService for how this bypasses RLS safely. */
  async listCompanies() {
    return this.platformAdminPrisma.company.findMany({
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        vatNumber: true,
        crNumber: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Creates a merchant company + Owner on their behalf - the exact same
   * tenant bootstrap as self-service registration
   * (AuthService.createCompanyWithOwner: default branch/warehouse, Chart
   * of Accounts, trial subscription). No tokens are issued here - the
   * admin isn't the owner and never gets a session as one; the merchant
   * logs in themselves afterward with the credentials the admin set up.
   */
  async createCompany(dto: CreateCompanyByAdminDto) {
    const { companyId, user } = await this.authService.createCompanyWithOwner(dto);
    return {
      company: { id: companyId, legalName: dto.legalName },
      owner: { id: user.id, fullName: user.fullName, email: user.email, mobile: user.mobile },
    };
  }
}
