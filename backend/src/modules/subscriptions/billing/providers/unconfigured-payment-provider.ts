import { Injectable } from '@nestjs/common';
import {
  SubscriptionChargeRequest,
  SubscriptionChargeResult,
  SubscriptionPaymentProvider,
} from '../subscription-payment-provider.interface';

/**
 * Default (SUBSCRIPTION_PAYMENT_DRIVER=none) and only implemented provider
 * in this phase. Every real payment gateway needs real, provider-specific
 * credentials (API keys, merchant IDs, webhook secrets) this codebase does
 * not have and cannot fabricate - Phase 9 spec: "do not fake successful
 * payments" and "clearly mark anything requiring real provider
 * credentials". `charge()` always throws rather than ever returning
 * `status: 'succeeded'`, so no caller can accidentally treat an
 * unconfigured gateway as a working one.
 */
@Injectable()
export class UnconfiguredSubscriptionPaymentProvider implements SubscriptionPaymentProvider {
  readonly providerKey = 'none';

  async charge(request: SubscriptionChargeRequest): Promise<SubscriptionChargeResult> {
    void request;
    throw new Error(
      'لا مزوّد دفع حقيقي مربوط بالنظام (SUBSCRIPTION_PAYMENT_DRIVER=none) - ' +
        'تفعيل الاشتراك يتم حاليًا يدويًا من مركز التحكم فقط. لربط مزوّد دفع ' +
        'حقيقي، نفّذ SubscriptionPaymentProvider واضبط بيانات اعتماده الحقيقية ' +
        'قبل تغيير SUBSCRIPTION_PAYMENT_DRIVER.',
    );
  }
}
