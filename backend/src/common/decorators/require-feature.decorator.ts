import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from '../../modules/subscriptions/constants/feature-keys';

export const FEATURE_KEY = 'requiredFeature';

/**
 * Declares the plan feature entitlement a route requires, enforced by
 * SubscriptionGuard - a layer ADDITIONAL to `@RequirePermissions` (RBAC),
 * never a replacement (Milestone 8 spec section 6): RBAC answers "is this
 * user allowed", this decorator answers "does this company's plan include
 * this". Both run on the same route.
 */
export const RequireFeature = (feature: FeatureKey) => SetMetadata(FEATURE_KEY, feature);
