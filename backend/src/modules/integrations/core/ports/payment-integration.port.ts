/**
 * The only thing Core (future Sales/POS modules) is allowed to know about a
 * payment integration. No concrete provider (Qeedha or otherwise) may be
 * imported outside modules/integrations/providers/* - everything else goes
 * through this port + IntegrationRegistry. See docs/QEEDHA_INTEGRATION.md.
 *
 * Deliberately generic: field names here are our own design, not a copy of
 * any external API contract. When a real provider's contract is supplied,
 * its adapter translates between this port and that contract - this
 * interface itself should rarely need to change for that.
 */
export type PaymentTransactionStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'refunded';

export interface PaymentInitiationRequest {
  companyId: string;
  branchId?: string;
  invoiceReference: string;
  amount: string; // decimal as string - never a float over the wire
  currencyCode: string;
  customerReference?: string;
  idempotencyKey: string;
}

export interface PaymentInitiationResult {
  externalTransactionId: string;
  status: PaymentTransactionStatus;
}

export interface PaymentIntegrationPort {
  readonly providerKey: string;
  initiatePayment(request: PaymentInitiationRequest): Promise<PaymentInitiationResult>;
  getTransactionStatus(externalTransactionId: string): Promise<PaymentTransactionStatus>;
}
