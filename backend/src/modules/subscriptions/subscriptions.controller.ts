import { Controller, Get } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionExempt } from '../../common/decorators/subscription-exempt.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SubscriptionService } from './subscription.service';

/**
 * Merchant-facing, READ-ONLY (Milestone 8 spec section 14: "Merchant APIs
 * must not allow changing plan, changing subscription status, extending
 * trial, changing limits, modifying billing data"). No RBAC permission is
 * required beyond being an active member of the company - every member
 * should be able to see what their company can/can't do, same as `/auth/me`.
 * Both routes are `@SubscriptionExempt()`: a suspended/expired company must
 * still be able to see exactly that (section 10 "recovery/visibility").
 */
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @SubscriptionExempt()
  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.subscriptionService.getMerchantView(tx, user.companyId),
    );
  }

  @SubscriptionExempt()
  @Get('plans')
  listPlans(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) => this.subscriptionService.listPlans(tx));
  }
}
