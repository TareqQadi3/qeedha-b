import { ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Plan, Subscription, SubscriptionStatus } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FeatureKey } from './constants/feature-keys';
import { PLAN_CODES } from './constants/default-plans';
import { TRIAL_PERIOD_DAYS } from './constants/trial';

export type UsageLimitResource = 'users' | 'branches' | 'monthlySales';

/** Subscription statuses that block MUTATING requests (see SubscriptionGuard). Reads stay allowed - "recovery/visibility" (Milestone 8 spec section 10). */
const RESTRICTED_STATUSES: SubscriptionStatus[] = ['expired', 'suspended', 'cancelled'];

export interface SubscriptionContext {
  subscription: Subscription;
  plan: Plan;
  /** Last explicitly-set status combined with a lazily-detected trial expiry - see getEffectiveStatus. */
  effectiveStatus: SubscriptionStatus;
}

/**
 * The single place subscription/plan/entitlement/usage-limit logic lives
 * (Milestone 8 spec sections 6/11: "centralized... avoid scattering `if
 * plan === ...` throughout code"). Guards and controllers call this service;
 * they never read Subscription/Plan rows directly.
 */
@Injectable()
export class SubscriptionService {
  constructor(private readonly auditService: AuditService) {}

  /**
   * "expired" is not a status anything sets directly - it is discovered the
   * first time a `trialing` subscription's `trialEndsAt` has passed. This is
   * a pure function so both the guard (read-only check) and
   * loadContext (which persists the transition) share one definition of
   * "did the trial end".
   */
  computeEffectiveStatus(
    subscription: Pick<Subscription, 'status' | 'trialEndsAt'>,
  ): SubscriptionStatus {
    if (
      subscription.status === 'trialing' &&
      subscription.trialEndsAt &&
      subscription.trialEndsAt.getTime() < Date.now()
    ) {
      return 'expired';
    }
    return subscription.status;
  }

  isRestricted(status: SubscriptionStatus): boolean {
    return RESTRICTED_STATUSES.includes(status);
  }

  hasFeature(plan: Plan, featureKey: FeatureKey): boolean {
    const features = plan.features as Record<string, boolean> | null;
    return features?.[featureKey] === true;
  }

  /**
   * Loads company + subscription + plan for enforcement, and performs the
   * ONE lazy state transition this codebase needs (trial expiry) since there
   * is no background job scheduler here to do it proactively - see
   * docs/DOMAIN_MODEL.md "SaaS / Subscription" "Why no cron". Every
   * authenticated request that reaches SubscriptionGuard runs this, so a
   * trial that has expired is discovered (and persisted, and audited) on the
   * very next request after expiry - "do not silently leave expired
   * companies fully active forever" (Milestone 8 spec section 9).
   *
   * If no subscription row exists at all (a company created before this
   * migration, or any other gap), one is lazily created here on the
   * PROFESSIONAL plan with a fresh trial, reusing createInitialSubscription.
   * Done inside the caller's already-tenant-scoped `tx` (RLS-safe, single
   * company) rather than as a cross-tenant backfill in the migration SQL:
   * `subscriptions` carries FORCE ROW LEVEL SECURITY, and this app's
   * migration/seed connection is a regular (non-superuser, non-BYPASSRLS)
   * role, so a migration-time `INSERT ... SELECT FROM companies` would
   * itself be silently blocked by RLS - see docs/DOMAIN_MODEL.md
   * "SaaS / Subscription" "Why lazy backfill, not a migration backfill".
   * This also satisfies Milestone 8 spec section 21 ("must not require
   * manual database edits after deployment") for any pre-existing company.
   */
  async loadContext(tx: TenantClient, companyId: string): Promise<SubscriptionContext> {
    let subscription = await tx.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
    if (!subscription) {
      await this.createInitialSubscription(tx, companyId);
      subscription = await tx.subscription.findUniqueOrThrow({
        where: { companyId },
        include: { plan: true },
      });
    }

    const effectiveStatus = this.computeEffectiveStatus(subscription);
    if (effectiveStatus !== subscription.status) {
      subscription = await tx.subscription.update({
        where: { companyId },
        data: { status: effectiveStatus },
        include: { plan: true },
      });
      await this.auditService.log(tx, {
        companyId,
        action: 'subscription.trial_expired',
        entityType: 'Subscription',
        entityId: subscription.id,
        beforeState: { status: 'trialing' },
        afterState: { status: effectiveStatus },
      });
    }

    return { subscription, plan: subscription.plan, effectiveStatus };
  }

  /**
   * Called from AuthService.registerCompany inside its own withTenant
   * transaction, right after the Company row is created - every company
   * gets a real subscription from the moment it exists, never a null/absent
   * one (Milestone 8 spec section 9: "Registration should create appropriate
   * initial subscription/trial state"). See default-plans.ts for why
   * PLAN_CODES.PROFESSIONAL (the most generous seed plan) is the one
   * assigned here.
   */
  /**
   * `planCode` is the Website phase's package selection (Pricing page ->
   * RegisterCompanyDto.planCode) - optional, defaults to
   * PLAN_CODES.PROFESSIONAL exactly as before this parameter existed, so
   * every pre-existing caller (registerCompany with no planCode, the
   * lazy-backfill path in loadContext) is unaffected. Falls back to the
   * same default if the requested code doesn't resolve to an active plan,
   * rather than failing registration over an invalid/stale code from the
   * client.
   */
  async createInitialSubscription(tx: TenantClient, companyId: string, planCode?: string) {
    const requestedPlan = planCode
      ? await tx.plan.findFirst({ where: { code: planCode, isActive: true } })
      : null;
    const plan =
      requestedPlan ?? (await tx.plan.findUnique({ where: { code: PLAN_CODES.PROFESSIONAL } }));
    if (!plan) {
      throw new InternalServerErrorException(
        'خطة الاشتراك الافتراضية غير موجودة - تأكد من تشغيل prisma db seed',
      );
    }

    const trialEndsAt = new Date(Date.now() + TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const subscription = await tx.subscription.create({
      data: { companyId, planId: plan.id, status: 'trialing', trialEndsAt },
    });

    await this.auditService.log(tx, {
      companyId,
      action: 'subscription.created',
      entityType: 'Subscription',
      entityId: subscription.id,
      afterState: { planCode: plan.code, status: 'trialing', trialEndsAt },
    });
    await this.auditService.log(tx, {
      companyId,
      action: 'subscription.trial_started',
      entityType: 'Subscription',
      entityId: subscription.id,
      afterState: { trialEndsAt },
    });

    return subscription;
  }

  /**
   * Locks the company's subscription row for the rest of the caller's
   * transaction, serializing concurrent limit-checked creations for that
   * tenant (same `SELECT ... FOR UPDATE` pattern used throughout this
   * codebase - e.g. SalesReturnService locking sale_items). One row lock per
   * tenant covers users/branches/monthlySales together: these are
   * low-frequency admin/setup actions, not a hot path, so the coarser
   * cross-resource serialization is an acceptable, simple trade-off over
   * adding a dedicated lock target per resource (Milestone 8 spec section 8:
   * "use database constraints, transactions, atomic counters, locking").
   *
   * Deliberately COUNT(*)s the owning table rather than maintaining a
   * separate stored usage counter: these are small-cardinality,
   * cheaply-derivable counts, and a stored counter would be exactly the kind
   * of "store values that can be derived unless there is a clear performance
   * reason" denormalization Milestone 8 spec section 18 warns against.
   */
  async assertWithinLimit(
    tx: TenantClient,
    companyId: string,
    resource: UsageLimitResource,
  ): Promise<void> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subscriptions WHERE company_id = ${companyId}::uuid FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new InternalServerErrorException('لا يوجد اشتراك لهذه المنشأة');
    }

    const subscription = await tx.subscription.findUniqueOrThrow({
      where: { companyId },
      include: { plan: true },
    });

    const { limit, current, label } = await this.resourceUsage(
      tx,
      companyId,
      subscription.plan,
      resource,
    );
    if (limit !== null && current >= limit) {
      throw new ForbiddenException(
        `تم الوصول للحد الأقصى لخطة الاشتراك الحالية (${label}: ${limit}) - يرجى التواصل مع الدعم للترقية`,
      );
    }
  }

  private async resourceUsage(
    tx: TenantClient,
    companyId: string,
    plan: Plan,
    resource: UsageLimitResource,
  ): Promise<{ limit: number | null; current: number; label: string }> {
    switch (resource) {
      case 'users': {
        const current = await tx.membership.count({ where: { companyId, status: 'active' } });
        return { limit: plan.maxUsers, current, label: 'عدد المستخدمين' };
      }
      case 'branches': {
        const current = await tx.branch.count({ where: { companyId, deletedAt: null } });
        return { limit: plan.maxBranches, current, label: 'عدد الفروع' };
      }
      case 'monthlySales': {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const current = await tx.sale.count({
          where: { companyId, createdAt: { gte: startOfMonth } },
        });
        return { limit: plan.maxMonthlySales, current, label: 'عدد مبيعات الشهر' };
      }
    }
  }

  /** Merchant-facing read model - GET /subscriptions/me. Never exposes internal ids beyond what the merchant's own company already owns. */
  async getMerchantView(tx: TenantClient, companyId: string) {
    const { subscription, plan, effectiveStatus } = await this.loadContext(tx, companyId);

    const [usersUsed, branchesUsed, monthlySalesUsed] = await Promise.all([
      this.resourceUsage(tx, companyId, plan, 'users'),
      this.resourceUsage(tx, companyId, plan, 'branches'),
      this.resourceUsage(tx, companyId, plan, 'monthlySales'),
    ]);

    const trialDaysRemaining =
      subscription.status === 'trialing' && subscription.trialEndsAt
        ? Math.max(
            0,
            Math.ceil((subscription.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
          )
        : null;

    return {
      status: subscription.status,
      effectiveStatus,
      isRestricted: this.isRestricted(effectiveStatus),
      trialEndsAt: subscription.trialEndsAt,
      trialDaysRemaining,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelledAt: subscription.cancelledAt,
      plan: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        priceMonthlySar: plan.priceMonthlySar,
        billingInterval: plan.billingInterval,
      },
      features: plan.features,
      usage: {
        users: usersUsed,
        branches: branchesUsed,
        monthlySales: monthlySalesUsed,
      },
      // No external payment collection is implemented in this milestone
      // (Milestone 8 spec section 16) - the frontend renders this instead of
      // a checkout flow. See docs/DEMO.md "Subscription & Billing".
      billingNote:
        'إدارة الفوترة والترقية ستكون متاحة قريبًا عبر مركز التحكم في Qeedha. للترقية أو الاستفسار حول الفوترة، يرجى التواصل مع الدعم.',
    };
  }

  /** Read-only plan catalog for the merchant app's upgrade CTA - never a mutation endpoint (Milestone 8 spec section 14). */
  async listPlans(tx: TenantClient) {
    const plans = await tx.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthlySar: 'asc' },
    });
    return plans.map((plan) => ({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceMonthlySar: plan.priceMonthlySar,
      billingInterval: plan.billingInterval,
      maxUsers: plan.maxUsers,
      maxBranches: plan.maxBranches,
      maxMonthlySales: plan.maxMonthlySales,
      features: plan.features,
    }));
  }

  // ---------------------------------------------------------------------
  // Control-Center-ready lifecycle transitions (Milestone 8 spec section
  // 15). NOT exposed by any controller in this milestone - no admin/Control
  // Center authentication architecture exists yet to protect them, and
  // inventing one is explicitly out of scope ("do not invent external
  // authentication architecture"). These exist so a future privileged
  // module can call them without any change to this service, and so the
  // audit trail's action vocabulary (section 19) is already correct.
  // ---------------------------------------------------------------------

  async changePlan(tx: TenantClient, companyId: string, newPlanId: string, actorUserId?: string) {
    const before = await tx.subscription.findUniqueOrThrow({ where: { companyId } });
    const subscription = await tx.subscription.update({
      where: { companyId },
      data: { planId: newPlanId },
    });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'subscription.plan_changed',
      entityType: 'Subscription',
      entityId: subscription.id,
      beforeState: { planId: before.planId },
      afterState: { planId: newPlanId },
    });
    return subscription;
  }

  async setStatus(
    tx: TenantClient,
    companyId: string,
    status: SubscriptionStatus,
    action: string,
    actorUserId?: string,
  ) {
    const before = await tx.subscription.findUniqueOrThrow({ where: { companyId } });
    const subscription = await tx.subscription.update({
      where: { companyId },
      data: {
        status,
        cancelledAt: status === 'cancelled' ? new Date() : before.cancelledAt,
      },
    });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action,
      entityType: 'Subscription',
      entityId: subscription.id,
      beforeState: { status: before.status },
      afterState: { status },
    });
    return subscription;
  }

  async extendTrial(
    tx: TenantClient,
    companyId: string,
    newTrialEndsAt: Date,
    actorUserId?: string,
  ) {
    const before = await tx.subscription.findUniqueOrThrow({ where: { companyId } });
    const subscription = await tx.subscription.update({
      where: { companyId },
      data: { trialEndsAt: newTrialEndsAt, status: 'trialing' },
    });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'subscription.trial_extended',
      entityType: 'Subscription',
      entityId: subscription.id,
      beforeState: { trialEndsAt: before.trialEndsAt },
      afterState: { trialEndsAt: newTrialEndsAt },
    });
    return subscription;
  }
}
