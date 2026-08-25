import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformAdminPrismaService } from '../../common/prisma/platform-admin-prisma.service';
import { AffiliatesService } from '../affiliates/affiliates.service';
import { CareersService } from '../careers/careers.service';
import { AuthService } from '../auth/auth.service';
import { PlanProductKey } from '../subscriptions/constants/products';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { CreateCompanyByAdminDto } from './dto/create-company-by-admin.dto';
import { CreateMarketDto, UpdateMarketDto } from './dto/market.dto';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { PlatformAdminLoginDto } from './dto/platform-admin-login.dto';
import { SetSubscriptionOverridesDto } from './dto/subscription-actions.dto';
import { CreateStaffDto } from './dto/create-staff.dto';

export const PLATFORM_ADMIN_JWT_SCOPE = 'platform_admin';

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAdminPrisma: PlatformAdminPrismaService,
    private readonly authService: AuthService,
    private readonly subscriptionService: SubscriptionService,
    private readonly affiliatesService: AffiliatesService,
    private readonly careersService: CareersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // -------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------

  /**
   * `platform_admins` is global data with no RLS (same reasoning as
   * `users` post-identity-refactor - see docs/DOMAIN_MODEL.md), so the
   * normal app connection reads it directly. No AuthLookupPrismaService-
   * style bypass needed for this half; that's only for cross-tenant data
   * (companies/subscriptions) below.
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
      { sub: admin.id, scope: PLATFORM_ADMIN_JWT_SCOPE, role: admin.role },
      {
        secret: this.config.get<string>('JWT_PLATFORM_ADMIN_SECRET'),
        expiresIn: this.config.get<string>('JWT_PLATFORM_ADMIN_TTL'),
      },
    );

    return {
      accessToken,
      admin: { id: admin.id, fullName: admin.fullName, email: admin.email, role: admin.role },
    };
  }

  async me(adminId: string) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedException('الحساب غير نشط');
    }
    return { id: admin.id, fullName: admin.fullName, email: admin.email, role: admin.role };
  }

  // -------------------------------------------------------------------
  // Staff (admin role only - see PlatformAdminRoleGuard)
  // -------------------------------------------------------------------

  async listStaff() {
    return this.prisma.platformAdmin.findMany({
      select: { id: true, fullName: true, email: true, role: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createStaff(dto: CreateStaffDto) {
    const existing = await this.prisma.platformAdmin.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException('هذا البريد الإلكتروني مُستخدَم بالفعل لحساب مدير آخر');
    }
    const passwordHash = await argon2.hash(dto.password);
    const admin = await this.prisma.platformAdmin.create({
      data: { fullName: dto.fullName, email: dto.email, passwordHash, role: dto.role },
    });
    return { id: admin.id, fullName: admin.fullName, email: admin.email, role: admin.role };
  }

  // -------------------------------------------------------------------
  // Merchants / Overview (companies + subscriptions across every tenant -
  // see PlatformAdminPrismaService / manual-sql 004+005 for how this
  // bypasses RLS safely, read-only, narrow columns only)
  // -------------------------------------------------------------------

  private async listCompaniesWithSubscriptions() {
    const [companies, subscriptions, plans] = await Promise.all([
      this.platformAdminPrisma.company.findMany({
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          vatNumber: true,
          crNumber: true,
          countryCode: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.platformAdminPrisma.subscription.findMany({
        select: {
          companyId: true,
          planId: true,
          status: true,
          trialEndsAt: true,
          createdAt: true,
        },
      }),
      // `plans` carries no RLS at all - reachable via the normal app
      // connection, no bypass needed (see schema.prisma comment on Plan).
      this.prisma.plan.findMany({
        select: { id: true, code: true, name: true, priceMonthlySar: true, products: true },
      }),
    ]);

    const planById = new Map(plans.map((p) => [p.id, p]));
    const subscriptionByCompanyId = new Map(subscriptions.map((s) => [s.companyId, s]));

    return companies.map((company) => {
      const subscription = subscriptionByCompanyId.get(company.id);
      const plan = subscription ? planById.get(subscription.planId) : undefined;
      return {
        ...company,
        subscription: subscription
          ? {
              status: subscription.status,
              trialEndsAt: subscription.trialEndsAt,
              plan: plan ? { code: plan.code, name: plan.name, products: plan.products } : null,
            }
          : null,
      };
    });
  }

  /** Every merchant on the platform, across every tenant, with their subscription/plan/product. */
  async listMerchants() {
    return this.listCompaniesWithSubscriptions();
  }

  /** Website phase spec "Control Center" "Overview". Deliberately does NOT include per-tenant business data (customers/transactions counts) - see docs/WEBSITE.md "Known gaps" for why (would require widening the bypass role far beyond its documented narrow purpose). */
  async getOverview() {
    const merchants = await this.listCompaniesWithSubscriptions();
    const [affiliates, applications] = await Promise.all([
      this.affiliatesService.listAffiliates(),
      this.careersService.listApplications(),
    ]);

    const byStatus = (status: SubscriptionStatus) =>
      merchants.filter((m) => m.subscription?.status === status).length;

    const hasProduct = (m: (typeof merchants)[number], product: PlanProductKey) =>
      m.subscription?.plan
        ? this.subscriptionService.hasProduct(m.subscription.plan, product)
        : false;
    const paidOrTrialing = merchants.filter(
      (m) => m.subscription?.status === 'active' || m.subscription?.status === 'trialing',
    );

    return {
      totalMerchants: merchants.length,
      activeMerchants: merchants.filter((m) => m.status === 'active').length,
      trialSubscriptions: byStatus('trialing'),
      expiredTrials: byStatus('expired'),
      activeSubscriptions: byStatus('active'),
      suspendedSubscriptions: byStatus('suspended'),
      cancelledSubscriptions: byStatus('cancelled'),
      qeedhaBSubscribers: paidOrTrialing.filter(
        (m) => hasProduct(m, 'qeedha_b') && !hasProduct(m, 'qeedha'),
      ).length,
      qeedhaSubscribers: paidOrTrialing.filter(
        (m) => hasProduct(m, 'qeedha') && !hasProduct(m, 'qeedha_b'),
      ).length,
      combinedSubscribers: paidOrTrialing.filter(
        (m) => hasProduct(m, 'qeedha_b') && hasProduct(m, 'qeedha'),
      ).length,
      totalAffiliates: affiliates.length,
      totalCommissionSar: affiliates.reduce((sum, a) => sum + a.totalCommissionSar, 0),
      pendingCommissionSar: affiliates.reduce((sum, a) => sum + a.pendingCommissionSar, 0),
      totalApplications: applications.length,
      newApplications: applications.filter((a) => a.status === 'new').length,
      recentMerchants: merchants.slice(0, 5),
    };
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

  // -------------------------------------------------------------------
  // Subscription lifecycle (Control-Center-ready methods
  // SubscriptionService already exposed for exactly this - see that
  // service's own comment. companyId is always a path param the admin
  // supplies explicitly; every write still goes through the normal
  // RLS-scoped app connection via withTenant, never the bypass role.)
  // -------------------------------------------------------------------

  async setSubscriptionStatus(companyId: string, status: SubscriptionStatus, adminId: string) {
    const result = await this.prisma.withTenant(companyId, async (tx) => {
      const subscription = await this.subscriptionService.setStatus(
        tx,
        companyId,
        status,
        `subscription.admin_set_${status}`,
      );
      const plan = await tx.plan.findUnique({ where: { id: subscription.planId } });
      return {
        subscription,
        planPriceSar: plan?.priceMonthlySar ? Number(plan.priceMonthlySar) : null,
      };
    });

    // Website phase ("Affiliate system"): the ONE point in this codebase
    // where a subscription becomes `active` under admin control - see
    // AffiliatesService.computeCommissionForCompanyActivation for why this
    // is the commission trigger. adminId is accepted for the audit trail
    // shape (subscriptionService.setStatus above), not used further here.
    void adminId;
    if (status === 'active') {
      await this.affiliatesService.computeCommissionForCompanyActivation(
        companyId,
        result.planPriceSar,
      );
    }
    return result.subscription;
  }

  async changeSubscriptionPlan(companyId: string, planCode: string) {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new NotFoundException('الخطة غير موجودة');
    return this.prisma.withTenant(companyId, (tx) =>
      this.subscriptionService.changePlan(tx, companyId, plan.id),
    );
  }

  async extendSubscriptionTrial(companyId: string, days: number) {
    if (days <= 0 || days > 365) {
      throw new BadRequestException('عدد الأيام غير صالح');
    }
    const newTrialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.prisma.withTenant(companyId, (tx) =>
      this.subscriptionService.extendTrial(tx, companyId, newTrialEndsAt),
    );
  }

  /**
   * Phase 13 - the same effective-limits/usage view the merchant sees on
   * their own subscription page, PLUS the raw override values (the
   * merchant view only ever shows the resolved effective limit - an admin
   * editing overrides needs to see whether a limit is currently coming
   * from the plan or from an override already set on this company, and
   * what that override's exact value is, to pre-fill the edit form).
   */
  async getCompanySubscription(companyId: string) {
    return this.prisma.withTenant(companyId, async (tx) => {
      const [view, subscription] = await Promise.all([
        this.subscriptionService.getMerchantView(tx, companyId),
        tx.subscription.findUniqueOrThrow({ where: { companyId } }),
      ]);
      return {
        ...view,
        overrides: {
          usersOverride: subscription.usersOverride,
          branchesOverride: subscription.branchesOverride,
          warehousesOverride: subscription.warehousesOverride,
          cashiersOverride: subscription.cashiersOverride,
          accountantsOverride: subscription.accountantsOverride,
          managersOverride: subscription.managersOverride,
          productsOverride: subscription.productsOverride,
        },
      };
    });
  }

  /**
   * Phase 13 ("أخصص أي باقة من لوحة التحكم"): sets per-company overrides -
   * only the fields present in `dto` are touched (an omitted field leaves
   * that override as-is; an explicit `null` clears it back to "use the
   * plan's value" - see SetSubscriptionOverridesDto). Reuses the plain
   * `subscription` table update rather than SubscriptionService, since
   * this is direct administrative data-editing, not a lifecycle
   * transition with its own business rules (unlike setStatus/changePlan/
   * extendTrial above).
   */
  async setSubscriptionOverrides(companyId: string, dto: SetSubscriptionOverridesDto) {
    return this.prisma.withTenant(companyId, async (tx) => {
      const subscription = await tx.subscription.findUnique({ where: { companyId } });
      if (!subscription) throw new NotFoundException('لا يوجد اشتراك لهذه المنشأة');
      return tx.subscription.update({
        where: { companyId },
        data: {
          usersOverride: dto.usersOverride,
          branchesOverride: dto.branchesOverride,
          warehousesOverride: dto.warehousesOverride,
          cashiersOverride: dto.cashiersOverride,
          accountantsOverride: dto.accountantsOverride,
          managersOverride: dto.managersOverride,
          // Prisma's JSON columns need the Prisma.JsonNull sentinel to
          // actually clear to SQL NULL - a plain `null` here would instead
          // be rejected/misread as "no change" for a Json? field.
          ...(dto.productsOverride !== undefined && {
            productsOverride:
              dto.productsOverride === null ? Prisma.JsonNull : dto.productsOverride,
          }),
        },
        include: { plan: true },
      });
    });
  }

  // -------------------------------------------------------------------
  // Plans / Packages (admin role only)
  // -------------------------------------------------------------------

  async listAllPlans() {
    return this.prisma.plan.findMany({ orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async createPlan(dto: CreatePlanDto) {
    const existing = await this.prisma.plan.findUnique({ where: { code: dto.code } });
    if (existing) throw new BadRequestException('رمز هذه الخطة مُستخدَم بالفعل');
    return this.prisma.plan.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        priceMonthlySar: dto.priceMonthlySar,
        priceAnnualSar: dto.priceAnnualSar,
        billingInterval: dto.billingInterval ?? 'monthly',
        trialEligible: dto.trialEligible ?? true,
        trialDays: dto.trialDays ?? 14,
        maxUsers: dto.maxUsers,
        maxBranches: dto.maxBranches,
        maxMonthlySales: dto.maxMonthlySales,
        maxCashiers: dto.maxCashiers,
        maxAccountants: dto.maxAccountants,
        maxManagers: dto.maxManagers,
        maxWarehouses: dto.maxWarehouses,
        features: dto.features ?? {},
        products: dto.products ?? ['qeedha_b'],
        isRecommended: dto.isRecommended ?? false,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('الخطة غير موجودة');
    return this.prisma.plan.update({ where: { id }, data: dto });
  }

  // -------------------------------------------------------------------
  // Markets (admin role only)
  // -------------------------------------------------------------------

  async listAllMarkets() {
    return this.prisma.market.findMany({ orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }] });
  }

  async createMarket(dto: CreateMarketDto) {
    const existing = await this.prisma.market.findUnique({ where: { code: dto.code } });
    if (existing) throw new BadRequestException('هذا الرمز مُستخدَم بالفعل لسوق آخر');
    return this.prisma.market.create({
      data: {
        code: dto.code,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        currency: dto.currency,
        supportedLanguages: dto.supportedLanguages ?? ['ar', 'en'],
        isActive: dto.isActive ?? true,
        displayOrder: dto.displayOrder ?? 0,
      },
    });
  }

  async updateMarket(code: string, dto: UpdateMarketDto) {
    const market = await this.prisma.market.findUnique({ where: { code } });
    if (!market) throw new NotFoundException('السوق غير موجود');
    return this.prisma.market.update({ where: { code }, data: dto });
  }

  // -------------------------------------------------------------------
  // Affiliates / Applications (thin passthroughs - AffiliatesService/
  // CareersService already own the actual logic, shared with their public
  // self-service controllers)
  // -------------------------------------------------------------------

  listAffiliates() {
    return this.affiliatesService.listAffiliates();
  }

  setCommissionStatus(commissionId: string, status: 'pending' | 'approved' | 'paid') {
    return this.affiliatesService.setCommissionStatus(commissionId, status);
  }

  listApplications() {
    return this.careersService.listApplications();
  }

  setApplicationStatus(id: string, status: 'new' | 'reviewed' | 'accepted' | 'rejected') {
    return this.careersService.setStatus(id, status);
  }
}
