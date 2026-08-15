import { Injectable } from '@nestjs/common';
import { PaymentIntegrationPort } from './ports/payment-integration.port';

/**
 * Where a provider adapter (Qeedha in Phase 7, others later) registers
 * itself. Empty in Phase 1 on purpose - no adapters exist yet, so every
 * `connect` attempt correctly reports "no adapter registered" rather than
 * faking a connection. Tests register a throwaway fake adapter here to
 * prove the extension mechanism works without inventing any real provider's
 * contract.
 */
@Injectable()
export class IntegrationRegistry {
  private readonly adapters = new Map<string, PaymentIntegrationPort>();

  register(adapter: PaymentIntegrationPort): void {
    this.adapters.set(adapter.providerKey, adapter);
  }

  unregister(providerKey: string): void {
    this.adapters.delete(providerKey);
  }

  get(providerKey: string): PaymentIntegrationPort | undefined {
    return this.adapters.get(providerKey);
  }

  listRegisteredKeys(): string[] {
    return Array.from(this.adapters.keys());
  }
}
