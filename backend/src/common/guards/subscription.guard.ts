import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SUBSCRIPTION_EXEMPT_KEY } from '../decorators/subscription-exempt.decorator';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureKey, FEATURE_LABELS } from '../../modules/subscriptions/constants/feature-keys';
import { SubscriptionService } from '../../modules/subscriptions/subscription.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Runs after PermissionsGuard (RBAC). Two independent checks, both reading
 * from SubscriptionService.loadContext (Milestone 8 spec section 11
 * authorization chain: "Authenticated -> Tenant access -> RBAC ->
 * Subscription entitlement -> Business validation"):
 *
 * 1. Company suspended (CompanyStatus, previously unenforced anywhere in
 *    this codebase - see docs/DOMAIN_MODEL.md "SaaS / Subscription" "Company
 *    lifecycle") -> blocks everything except exempt routes. The harshest,
 *    ops-level lifecycle state.
 * 2. Subscription effectively restricted (expired/suspended/cancelled) ->
 *    blocks MUTATING requests only; reads stay available so a merchant can
 *    still see their own data and account status while restricted
 *    (Milestone 8 spec section 10: "do not lock the merchant out of all
 *    useful information").
 *
 * A route additionally carrying `@RequireFeature(key)` is blocked
 * regardless of status/method the moment the current plan doesn't include
 * that feature - this is the plan-based entitlement check from spec section
 * 11's worked example (Plan A: POS=true, Excel Import=false).
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) return true; // JwtAuthGuard already rejects unauthenticated requests

    const isExempt = this.reflector.getAllAndOverride<boolean>(SUBSCRIPTION_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredFeature = this.reflector.getAllAndOverride<FeatureKey>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { company, effectiveStatus, plan } = await this.prisma.withTenant(
      user.companyId,
      async (tx) => {
        const company = await tx.company.findUniqueOrThrow({ where: { id: user.companyId } });
        const ctx = await this.subscriptionService.loadContext(tx, user.companyId);
        return { company, ...ctx };
      },
    );

    if (requiredFeature && !this.subscriptionService.hasFeature(plan, requiredFeature)) {
      throw new ForbiddenException(
        `هذه الميزة (${FEATURE_LABELS[requiredFeature]}) غير مشمولة في خطة الاشتراك الحالية (${plan.name}) - يرجى التواصل مع الدعم للترقية`,
      );
    }

    if (isExempt) return true;

    if (company.status === 'suspended') {
      throw new ForbiddenException('المنشأة موقوفة حاليًا - يرجى التواصل مع الدعم لاستعادة الوصول');
    }

    const isMutating = MUTATING_METHODS.has(request.method);
    if (isMutating && this.subscriptionService.isRestricted(effectiveStatus)) {
      throw new ForbiddenException(
        'انتهت صلاحية الاشتراك أو تم إيقافه - يمكنك الاطلاع على بياناتك الحالية، ولإجراء عمليات جديدة يرجى التواصل مع الدعم لتجديد الاشتراك',
      );
    }

    return true;
  }
}
