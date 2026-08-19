import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AffiliateLoginDto } from './dto/affiliate-login.dto';
import { RegisterAffiliateDto } from './dto/register-affiliate.dto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I - avoids visual ambiguity in a printed/shared referral code
const CODE_LENGTH = 8;

export const AFFILIATE_JWT_SCOPE = 'affiliate';

/**
 * Affiliate registration/referral/commission - Website phase spec
 * "Affiliate system". Affiliate/AffiliateReferral/Commission carry no
 * RLS (platform-level data, not tenant-owned - see schema.prisma comment
 * above Affiliate), so this reads/writes PrismaService directly, no
 * tenant context needed anywhere in this service.
 */
@Injectable()
export class AffiliatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private generateCode(): string {
    const bytes = randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return code;
  }

  async register(dto: RegisterAffiliateDto) {
    const existing = await this.prisma.affiliate.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('هذا البريد الإلكتروني مسجَّل بالفعل كمسوّق');
    }

    // Collision probability is negligible (33^8 keyspace) but checked
    // explicitly rather than trusted blindly - same defensive posture as
    // every other "generate then verify uniqueness" code path in this
    // codebase (e.g. IntegrationConnection.publicReference).
    let code = this.generateCode();
    while (await this.prisma.affiliate.findUnique({ where: { code } })) {
      code = this.generateCode();
    }

    const passwordHash = await argon2.hash(dto.password);
    const affiliate = await this.prisma.affiliate.create({
      data: { fullName: dto.fullName, email: dto.email, mobile: dto.mobile, code, passwordHash },
    });

    return {
      id: affiliate.id,
      fullName: affiliate.fullName,
      email: affiliate.email,
      code: affiliate.code,
    };
  }

  /**
   * Phase 9 ("Affiliate Dashboard" self-service login). `passwordHash`
   * being null (an affiliate registered before this phase existed) is
   * treated identically to a wrong password - never a distinct error, so
   * neither response leaks whether the email exists or has a password
   * set yet.
   */
  async login(dto: AffiliateLoginDto) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { email: dto.email } });
    if (!affiliate || affiliate.status !== 'active' || !affiliate.passwordHash) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    const passwordValid = await argon2.verify(affiliate.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const accessToken = this.jwtService.sign(
      { sub: affiliate.id, scope: AFFILIATE_JWT_SCOPE },
      {
        secret: this.config.get<string>('JWT_AFFILIATE_SECRET'),
        expiresIn: this.config.get<string>('JWT_AFFILIATE_TTL'),
      },
    );

    return {
      accessToken,
      affiliate: {
        id: affiliate.id,
        fullName: affiliate.fullName,
        email: affiliate.email,
        code: affiliate.code,
      },
    };
  }

  async me(affiliateId: string) {
    const affiliate = await this.prisma.affiliate.findUniqueOrThrow({ where: { id: affiliateId } });
    return {
      id: affiliate.id,
      fullName: affiliate.fullName,
      email: affiliate.email,
      code: affiliate.code,
      commissionPercent: affiliate.commissionPercent,
      status: affiliate.status,
    };
  }

  /** Control Center listing - referral/commission counts per affiliate. */
  async listAffiliates() {
    const affiliates = await this.prisma.affiliate.findMany({
      orderBy: { createdAt: 'desc' },
      include: { referrals: { include: { commission: true } } },
    });

    return affiliates.map((a) => ({
      id: a.id,
      fullName: a.fullName,
      email: a.email,
      mobile: a.mobile,
      code: a.code,
      commissionPercent: a.commissionPercent,
      status: a.status,
      createdAt: a.createdAt,
      ...this.summarizeCommissions(a.referrals),
    }));
  }

  private summarizeCommissions(
    referrals: { commission: { amountSar: unknown; status: string } | null }[],
  ) {
    const commissions = referrals.map((r) => r.commission).filter((c) => c !== null);
    return {
      referralsCount: referrals.length,
      totalCommissionSar: commissions.reduce((sum, c) => sum + Number(c!.amountSar), 0),
      pendingCommissionSar: commissions
        .filter((c) => c!.status === 'pending')
        .reduce((sum, c) => sum + Number(c!.amountSar), 0),
    };
  }

  /**
   * Phase 9 ("Affiliate Dashboard" - "Show referrals, registrations,
   * trials, conversions and commissions. Use real database data."). Reads
   * each referred company's subscription status through the NORMAL
   * RLS-scoped `withTenant` connection, one company at a time (never a
   * cross-tenant bypass role) - an affiliate's own referral list is
   * naturally small, so N single-tenant reads is the right trade-off over
   * inventing a fourth narrow bypass-RLS Postgres role just for this.
   * Deliberately returns NO merchant business data (legal name, VAT,
   * contact info, ...) - only referral date + subscription lifecycle
   * status - same "affiliate isolation" restraint
   * PlatformAdminService.getOverview already applies to itself for
   * per-tenant business data.
   */
  async getDashboard(affiliateId: string) {
    const [affiliate, referrals] = await Promise.all([
      this.prisma.affiliate.findUniqueOrThrow({ where: { id: affiliateId } }),
      this.prisma.affiliateReferral.findMany({
        where: { affiliateId },
        include: { commission: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const referralRows = await Promise.all(
      referrals.map(async (referral) => {
        const subscription = await this.prisma.withTenant(referral.companyId, (tx) =>
          tx.subscription.findUnique({
            where: { companyId: referral.companyId },
            select: { status: true, trialEndsAt: true },
          }),
        );
        return {
          id: referral.id,
          referredAt: referral.createdAt,
          subscriptionStatus: subscription?.status ?? null,
          trialEndsAt: subscription?.trialEndsAt ?? null,
          commission: referral.commission
            ? {
                amountSar: Number(referral.commission.amountSar),
                status: referral.commission.status,
              }
            : null,
        };
      }),
    );

    const { referralsCount, totalCommissionSar, pendingCommissionSar } =
      this.summarizeCommissions(referrals);

    return {
      affiliate: {
        fullName: affiliate.fullName,
        email: affiliate.email,
        code: affiliate.code,
        commissionPercent: affiliate.commissionPercent,
      },
      summary: {
        totalReferrals: referralsCount,
        trials: referralRows.filter((r) => r.subscriptionStatus === 'trialing').length,
        conversions: referralRows.filter((r) => r.subscriptionStatus === 'active').length,
        expiredOrCancelled: referralRows.filter((r) =>
          ['expired', 'suspended', 'cancelled'].includes(r.subscriptionStatus ?? ''),
        ).length,
        totalCommissionSar,
        pendingCommissionSar,
      },
      referrals: referralRows,
    };
  }

  /**
   * Called once, right after a referred company's subscription is set to
   * `active` by the Control Center (PlatformAdminService.setSubscriptionStatus)
   * - the only realistic "became a paid customer" event in this codebase
   * (no payment gateway is integrated, see docs/WEBSITE.md "Known gaps").
   * Idempotent: `Commission.affiliateReferralId` is unique, so a second
   * call for the same company/referral is a no-op, never a duplicate
   * commission. Amount is captured once from the plan price in effect at
   * this moment - never recalculated retroactively if the plan price or
   * the affiliate's commission percent changes later (schema.prisma
   * Commission comment).
   */
  async computeCommissionForCompanyActivation(companyId: string, planPriceSar: number | null) {
    const referral = await this.prisma.affiliateReferral.findUnique({
      where: { companyId },
      include: { affiliate: true, commission: true },
    });
    if (!referral || referral.commission || !planPriceSar) {
      return null;
    }

    const amountSar = (planPriceSar * Number(referral.affiliate.commissionPercent)) / 100;
    return this.prisma.commission.create({
      data: { affiliateReferralId: referral.id, amountSar },
    });
  }

  /** Control Center only - affiliates can never call this on themselves (no such route is exposed on AffiliateAuthGuard-protected endpoints). */
  async setCommissionStatus(commissionId: string, status: 'pending' | 'approved' | 'paid') {
    return this.prisma.commission.update({ where: { id: commissionId }, data: { status } });
  }
}
