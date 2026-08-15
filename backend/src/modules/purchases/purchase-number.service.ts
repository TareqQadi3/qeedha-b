import { Injectable } from '@nestjs/common';
import { TenantClient } from '../../common/prisma/prisma.service';

/**
 * Atomic, tenant-scoped, concurrency-safe purchase reference numbering -
 * identical pattern to InvoiceNumberService (docs/PURCHASING.md "Numbering").
 */
@Injectable()
export class PurchaseNumberService {
  async issueNext(tx: TenantClient, companyId: string): Promise<string> {
    await tx.$executeRaw`
      INSERT INTO purchase_sequences (company_id, next_number)
      VALUES (${companyId}::uuid, 1)
      ON CONFLICT (company_id) DO NOTHING
    `;

    const result = await tx.$queryRaw<{ next_number: number }[]>`
      UPDATE purchase_sequences
      SET next_number = next_number + 1
      WHERE company_id = ${companyId}::uuid
      RETURNING next_number
    `;

    const issued = result[0].next_number - 1;
    return `PUR-${String(issued).padStart(6, '0')}`;
  }
}
