import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Generic inbound webhook inbox. Stores the raw event and nothing more -
 * there is no per-provider signature verification or processing logic yet
 * because no provider adapter exists (see IntegrationRegistry). Real
 * processing (verify signature, route to the right tenant/sale, update
 * integration_transactions) is added alongside each provider's adapter, not
 * here. Until then this endpoint is intentionally "receive and park", never
 * "trust and act on".
 */
@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async receive(providerKey: string, headers: Record<string, unknown>, payload: unknown) {
    const provider = await this.prisma.withoutTenant((tx) =>
      tx.integrationProvider.findUnique({ where: { key: providerKey } }),
    );
    if (!provider) {
      throw new NotFoundException('تكامل غير مسجَّل في الكتالوج');
    }

    return this.prisma.withoutTenant((tx) =>
      tx.webhookEvent.create({
        data: {
          providerKey,
          headers: headers as any,
          payload: payload as any,
        },
      }),
    );
  }
}
