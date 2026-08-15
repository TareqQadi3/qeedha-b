import { Injectable } from '@nestjs/common';
import { TenantClient } from '../../common/prisma/prisma.service';

/**
 * Atomic, tenant-scoped, concurrency-safe invoice numbering - see
 * docs/INVOICES.md "Numbering". Same pattern as
 * InventoryService.recordMovement's guarded stock update: a raw
 * `INSERT ... ON CONFLICT DO NOTHING` to guarantee the counter row exists,
 * then a single atomic `UPDATE ... RETURNING` to claim the next number.
 * Two concurrent callers for the same company serialize on that row's write
 * lock - neither can observe or reuse the other's number.
 *
 * Deliberately simple format (`INV-000123`, no year/branch/series prefix) -
 * per-company is the only scope Phase 3 needs. A future series/branch
 * scheme can be layered on top of this same counter mechanism without
 * changing it.
 */
@Injectable()
export class InvoiceNumberService {
  async issueNext(tx: TenantClient, companyId: string): Promise<string> {
    await tx.$executeRaw`
      INSERT INTO invoice_sequences (company_id, next_number)
      VALUES (${companyId}::uuid, 1)
      ON CONFLICT (company_id) DO NOTHING
    `;

    const result = await tx.$queryRaw<{ next_number: number }[]>`
      UPDATE invoice_sequences
      SET next_number = next_number + 1
      WHERE company_id = ${companyId}::uuid
      RETURNING next_number
    `;

    const issued = result[0].next_number - 1;
    return `INV-${String(issued).padStart(6, '0')}`;
  }
}
