import { SetMetadata } from '@nestjs/common';

export const SUBSCRIPTION_EXEMPT_KEY = 'subscriptionExempt';

/**
 * Marks a route as always reachable regardless of company/subscription
 * status - SubscriptionGuard skips both its company-suspended and
 * subscription-restricted checks. Reserved for the small "recovery/
 * visibility" surface Milestone 8 spec section 10 requires stay available
 * even to a suspended/expired company: session endpoints (/auth/me,
 * /auth/logout, /auth/refresh, tenant switching) and the subscription
 * read endpoints themselves (a merchant must be able to see their own
 * suspended/expired status and the "contact support" message).
 */
export const SubscriptionExempt = () => SetMetadata(SUBSCRIPTION_EXEMPT_KEY, true);
