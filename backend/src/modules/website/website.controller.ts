import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Public, unauthenticated read endpoints the marketing website needs
 * before a visitor has any session at all - language/country picker
 * (Market) and the pricing page (Plan). Both tables carry no RLS (same
 * "every visitor/tenant may read the catalog" reasoning as
 * SubscriptionsController.listPlans, docs/DOMAIN_MODEL.md "SaaS /
 * Subscription"), so this reads them directly off PrismaService with no
 * tenant context needed - genuinely nothing to authenticate here.
 * Deliberately a separate controller/prefix from `/subscriptions` (which
 * requires an authenticated Membership) rather than adding a public branch
 * to that one.
 */
@Public()
@Controller('website')
export class WebsiteController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('markets')
  async listMarkets() {
    return this.prisma.market.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
  }

  @Get('plans')
  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { priceMonthlySar: 'asc' }],
    });
    return plans.map((plan) => ({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceMonthlySar: plan.priceMonthlySar,
      priceAnnualSar: plan.priceAnnualSar,
      billingInterval: plan.billingInterval,
      trialEligible: plan.trialEligible,
      maxUsers: plan.maxUsers,
      maxBranches: plan.maxBranches,
      maxMonthlySales: plan.maxMonthlySales,
      features: plan.features,
      products: plan.products,
      isRecommended: plan.isRecommended,
    }));
  }
}
