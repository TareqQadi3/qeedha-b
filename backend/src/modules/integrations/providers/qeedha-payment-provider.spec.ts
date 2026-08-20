import { QeedhaPaymentProvider, QEEDHA_PAYMENTS_PROVIDER_KEY } from './qeedha-payment-provider';
import { PaymentInitiationRequest } from '../core/ports/payment-integration.port';

/**
 * Phase 11: proves the adapter foundation never fakes a successful/pending
 * payment result while no real Qeedha outbound contract exists yet - the
 * same guarantee `UnconfiguredSubscriptionPaymentProvider` gives for
 * subscription billing (Phase 9). This is the ONLY safe behavior for a
 * `PaymentIntegrationPort` implementation with nothing real behind it.
 */
describe('QeedhaPaymentProvider', () => {
  const provider = new QeedhaPaymentProvider();

  const request: PaymentInitiationRequest = {
    companyId: 'company-1',
    branchId: 'branch-1',
    invoiceReference: 'INV-0001',
    amount: '100.00',
    currencyCode: 'SAR',
    customerReference: 'cust-1',
    idempotencyKey: 'idem-1',
  };

  it('providerKey مطابق للمفتاح المسجَّل في IntegrationRegistry', () => {
    expect(provider.providerKey).toBe('qeedha_payments');
    expect(provider.providerKey).toBe(QEEDHA_PAYMENTS_PROVIDER_KEY);
  });

  it('providerKey مختلف عن مفتاح تكامل قيّدها Inbound (لا تصادم على IntegrationConnection.status)', () => {
    expect(provider.providerKey).not.toBe('qeedha');
  });

  it('initiatePayment يرفض دائمًا (لا نجاح/انتظار مزيَّف) طالما لا مزوّد حقيقي مضبوط', async () => {
    await expect(provider.initiatePayment(request)).rejects.toThrow();
  });

  it('getTransactionStatus يرفض دائمًا (لا حالة مزيَّفة) طالما لا مزوّد حقيقي مضبوط', async () => {
    await expect(provider.getTransactionStatus('ext-txn-1')).rejects.toThrow();
  });
});
