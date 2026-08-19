import { ConflictException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterAffiliateDto } from './dto/register-affiliate.dto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I - avoids visual ambiguity in a printed/shared referral code
const CODE_LENGTH = 8;

/**
 * Affiliate registration/referral/commission - Website phase spec
 * "Affiliate system". Affiliate/AffiliateReferral/Commission carry no
 * RLS (platform-level data, not tenant-owned - see schema.prisma comment
 * above Affiliate), so this reads/writes PrismaService directly, no
 * tenant context needed anywhere in this service.
 */
@Injectable()
export class AffiliatesService {
  constructor(private readonly prisma: PrismaService) {}

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

    const affiliate = await this.prisma.affiliate.create({
      data: { fullName: dto.fullName, email: dto.email, mobile: dto.mobile, code },
    });

    return {
      id: affiliate.id,
      fullName: affiliate.fullName,
      email: affiliate.email,
      code: affiliate.code,
    };
  }

  /** Control Center listing - referral/commission counts per affiliate. */
  async listAffiliates() {
    const affiliates = await this.prisma.affiliate.findMany({
      orderBy: { createdAt: 'desc' },
      include: { referrals: { include: { commission: true } } },
    });

    return affiliates.map((a) => {
      const commissions = a.referrals.map((r) => r.commission).filter((c) => c !== null);
      return {
        id: a.id,
        fullName: a.fullName,
        email: a.email,
        mobile: a.mobile,
        code: a.code,
        commissionPercent: a.commissionPercent,
        status: a.status,
        createdAt: a.createdAt,
        referralsCount: a.referrals.length,
        totalCommissionSar: commissions.reduce((sum, c) => sum + Number(c!.amountSar), 0),
        pendingCommissionSar: commissions
          .filter((c) => c!.status === 'pending')
          .reduce((sum, c) => sum + Number(c!.amountSar), 0),
      };
    });
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

  async setCommissionStatus(commissionId: string, status: 'pending' | 'approved' | 'paid') {
    return this.prisma.commission.update({ where: { id: commissionId }, data: { status } });
  }
}
