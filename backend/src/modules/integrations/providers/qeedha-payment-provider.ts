import { Injectable } from '@nestjs/common';
import {
  PaymentInitiationRequest,
  PaymentInitiationResult,
  PaymentIntegrationPort,
  PaymentTransactionStatus,
} from '../core/ports/payment-integration.port';

/**
 * Phase 11: the first concrete `PaymentIntegrationPort` adapter, filling
 * the `modules/integrations/providers/` folder left empty since Phase 1
 * (docs/INTEGRATION.md). Deliberately a DIFFERENT provider key from the
 * Milestone 9 inbound module's `'qeedha'` (`QEEDHA_PROVIDER_KEY` in
 * `modules/qeedha-integration/constants`): both directions share the same
 * `IntegrationConnection` row shape per company+providerKey, and that
 * inbound row's `status` column already carries real meaning ("qeedha can
 * call in") for a linked merchant. Reusing the same key here would let this
 * adapter's outbound connect()/disconnect() silently overwrite that
 * column - reusing another module's field for an unrelated purpose, which
 * is the exact anti-pattern the Phase 11 brief calls out. `qeedha_payments`
 * keeps the two connections (and their `status` fields) fully independent.
 *
 * There is no published Qeedha outbound payment API to integrate against
 * yet, so this adapter must not invent one. `QEEDHA_PAYMENT_DRIVER=none`
 * (the only supported value right now, see integrations.module.ts) keeps
 * every method throwing a clear "not connected" error instead of ever
 * faking a `success`/`pending` result - the same safe-default pattern as
 * `UnconfiguredSubscriptionPaymentProvider` (Phase 9). When a real Qeedha
 * outbound contract is published, a second driver implements this exact
 * same port with a real HTTP client; no change to the port, the registry,
 * or any future caller (Sales/POS) is needed.
 */
export const QEEDHA_PAYMENTS_PROVIDER_KEY = 'qeedha_payments';

@Injectable()
export class QeedhaPaymentProvider implements PaymentIntegrationPort {
  readonly providerKey = QEEDHA_PAYMENTS_PROVIDER_KEY;

  async initiatePayment(request: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
    void request;
    throw new Error(
      'لا اتصال فعلي ببيئة قيّدها بعد (QEEDHA_PAYMENT_DRIVER=none) - ' +
        'هذا الـAdapter بنية أساس فقط، بانتظار عقد API خارجي حقيقي من قيّدها. ' +
        'لا يمكن تنفيذ عملية دفع فعلية حتى يُضبَط مزوّد حقيقي.',
    );
  }

  async getTransactionStatus(externalTransactionId: string): Promise<PaymentTransactionStatus> {
    void externalTransactionId;
    throw new Error(
      'لا اتصال فعلي ببيئة قيّدها بعد (QEEDHA_PAYMENT_DRIVER=none) - ' +
        'لا يمكن الاستعلام عن حالة معاملة حتى يُضبَط مزوّد حقيقي.',
    );
  }
}
