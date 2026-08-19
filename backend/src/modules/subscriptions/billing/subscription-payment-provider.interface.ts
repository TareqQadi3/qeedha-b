export const SUBSCRIPTION_PAYMENT_PROVIDER = Symbol('SUBSCRIPTION_PAYMENT_PROVIDER');

export type SubscriptionChargeStatus = 'pending' | 'succeeded' | 'failed';

export interface SubscriptionChargeRequest {
  companyId: string;
  planCode: string;
  /** Decimal as a string - never a float over the wire (same discipline as PaymentInitiationRequest.amount). */
  amount: string;
  currencyCode: string;
  billingInterval: 'monthly' | 'annual';
  /** Prevents double-charging a retry of the same billing cycle. */
  idempotencyKey: string;
}

export interface SubscriptionChargeResult {
  externalChargeId: string;
  status: SubscriptionChargeStatus;
}

/**
 * Provider-agnostic port for SUBSCRIPTION billing (charging a merchant for
 * their Qeedha B subscription) - Phase 9 "Payment architecture". This is
 * deliberately a SEPARATE port from
 * `integrations/core/ports/payment-integration.port.ts`, which is a
 * different concern: that one is a per-company `IntegrationConnection`
 * (a merchant's own customer paying at POS checkout, provider credentials
 * scoped to that one tenant). Subscription billing is platform-level - the
 * platform charges the merchant, there is no per-tenant connection to
 * route through - so it follows the `EmailProvider` shape instead
 * (email-provider.interface.ts): one minimal interface, one safe default
 * implementation that NEVER claims a charge succeeded
 * (UnconfiguredSubscriptionPaymentProvider), and a documented plug-in point
 * for a real gateway (Stripe, Moyasar, HyperPay, Tap, ...) once real
 * credentials exist - see SubscriptionBillingModule.
 *
 * Nothing in this codebase calls `charge()` yet (Phase 9 explicitly: "do
 * not fake successful payments" - Control Center activation
 * (`PlatformAdminService.setSubscriptionStatus`) remains the only way a
 * subscription becomes `active` today, same as the Website phase). A
 * future real integration wires `charge()` into that same call site
 * without changing this interface.
 */
export interface SubscriptionPaymentProvider {
  readonly providerKey: string;
  charge(request: SubscriptionChargeRequest): Promise<SubscriptionChargeResult>;
}
