/**
 * Phase 2 (Integration) extension point - NOT implemented, NOT registered
 * anywhere, and NOT called by any code in this milestone. Declared now so
 * a future Phase 2 implementation has a stable seam to implement against
 * without EInvoiceService or any caller needing to change - same
 * "empty on purpose" principle as IntegrationRegistry
 * (modules/integrations/core/integration-registry.service.ts) before any
 * payment adapter existed.
 *
 * Building a real implementation of this port requires, at minimum, all of
 * the following - none of which exist in this project or environment, and
 * none of which this milestone invents or guesses at:
 *   - A confirmed ZATCA API contract (endpoint URLs, request/response
 *     schemas) for the Compliance, Clearance, and Reporting APIs.
 *   - A CSID (Cryptographic Stamp Identifier) issued by ZATCA for this
 *     specific merchant, obtained through their onboarding/compliance
 *     process.
 *   - A private key and X.509 certificate for signing outgoing invoices,
 *     held via a CertificateProvider/SecretProvider abstraction (not this
 *     interface's concern) - never in source code, git, or plain config.
 *   - A resolved business decision on Phase 2 applicability (which wave,
 *     revenue threshold, effective date) for the merchant in question -
 *     see docs/ZATCA.md "Decision Required".
 *
 * Method names/shapes below are this project's own design (not a copy of
 * ZATCA's actual API contract, which has not been reviewed) and may need to
 * change once a real contract is confirmed - do not treat this interface
 * itself as a compliance claim.
 */
export interface ZatcaSubmissionResult {
  /** ZATCA's own identifier for the accepted/rejected submission, when applicable. */
  externalReference?: string;
  status: 'accepted' | 'rejected';
  /** Raw response payload for audit/troubleshooting - never logged with secrets, see LoggingInterceptor policy. */
  rawResponse?: unknown;
}

export interface ZatcaProvider {
  /** Compliance/onboarding check for a single invoice before real submission - part of ZATCA's Fatoora compliance CSID flow. */
  checkCompliance(invoiceId: string): Promise<ZatcaSubmissionResult>;
  /** B2B (standard tax invoice): synchronous pre-approval before the invoice may be delivered to the buyer. */
  clearInvoice(invoiceId: string): Promise<ZatcaSubmissionResult>;
  /** B2C (simplified tax invoice): asynchronous submission, reported within the required window after delivery. */
  reportInvoice(invoiceId: string): Promise<ZatcaSubmissionResult>;
}
