import {
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

const OWNER_ROLE_NAME = 'Owner';

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

    const { user } = await this.prisma.withTenant(companyId, async (tx) => {
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

      const user = await tx.user.create({
        data: {
          id: userId,
          companyId,
          fullName: dto.ownerFullName,
          email: dto.ownerEmail,
          mobile: dto.ownerMobile,
          passwordHash,
        },
      });

      const ownerRole = await tx.role.findFirst({
        where: { companyId: null, name: OWNER_ROLE_NAME },
      });
      if (!ownerRole) {
        throw new InternalServerErrorException(
          'دور Owner النظامي غير موجود - تأكد من تشغيل prisma db seed قبل التسجيل',
        );
      }

      await tx.userRole.create({
        data: { companyId, userId: user.id, roleId: ownerRole.id, branchId: null },
      });

      return { user };
    });

    const tokens = await this.issueTokens(user.id, companyId);
    return {
      company: { id: companyId, legalName: dto.legalName },
      user: { id: user.id, fullName: user.fullName, email: user.email, mobile: user.mobile },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const record = await this.authLookupService.findCredentialsByIdentifier(dto.identifier);
    if (!record || record.status !== 'active') {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const passwordValid = await argon2.verify(record.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const tokens = await this.issueTokens(record.id, record.companyId);
    return {
      user: {
        id: record.id,
        fullName: record.fullName,
        locale: record.locale,
        companyId: record.companyId,
      },
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

    const tokens = await this.issueTokens(existing.userId, existing.companyId);

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
      const record = await tx.user.findFirst({
        where: { id: user.userId, companyId: user.companyId, deletedAt: null },
        include: { userRoles: { include: { role: true, branch: true } } },
      });
      if (!record) {
        throw new NotFoundException('المستخدم غير موجود');
      }

      const permissions = await this.iamService.getEffectivePermissionKeys(
        tx,
        user.userId,
        user.companyId,
      );

      return {
        id: record.id,
        fullName: record.fullName,
        email: record.email,
        mobile: record.mobile,
        locale: record.locale,
        companyId: record.companyId,
        roles: record.userRoles.map((ur) => ({
          name: ur.role.name,
          branch: ur.branch?.name ?? null,
        })),
        permissions: Array.from(permissions),
      };
    });
  }

  private async issueTokens(userId: string, companyId: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, companyId },
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
        companyId,
        tokenHash: hashToken(refreshTokenValue),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }
}
