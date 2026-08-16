import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TlvQrService } from './tlv-qr.service';

export interface InvoiceForCompliance {
  id: string;
  totalAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  issuedAt: Date;
}

/**
 * The only thing SalesService/InvoicesService are allowed to know about
 * ZATCA readiness: this one method, called once right after an Invoice is
 * created (see SalesService.createSale). Everything ZATCA-specific (QR
 * encoding, the compliance record's shape, what "not submitted" means) is
 * contained here - callers pass a plain invoice/company pair and get back a
 * compliance record, nothing more.
 *
 * Phase 1 (Generation) only: builds and stores a QR code locally. No
 * external call, no signing, no submission - see
 * ports/zatca-provider.port.ts for why Phase 2 isn't implemented.
 */
@Injectable()
export class EInvoiceService {
  private readonly logger = new Logger(EInvoiceService.name);

  constructor(
    private readonly tlvQrService: TlvQrService,
    private readonly auditService: AuditService,
  ) {}

  async generateForInvoice(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    invoice: InvoiceForCompliance,
  ) {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { legalName: true, vatNumber: true },
    });
    if (!company) {
      // Unreachable in practice (this always runs inside the same
      // withTenant() transaction that owns companyId), but never silently
      // skip auditing a genuinely unexpected state.
      this.logger.warn(
        `EInvoiceService: company ${companyId} not found while generating compliance record`,
      );
      return null;
    }

    let qrCode: string | null = null;
    let generatedAt: Date | null = null;
    const vatNumber = company.vatNumber?.trim();
    if (vatNumber) {
      qrCode = this.tlvQrService.encode({
        sellerName: company.legalName,
        vatNumber,
        timestamp: invoice.issuedAt.toISOString(),
        invoiceTotal: invoice.totalAmount.toFixed(2),
        vatTotal: invoice.taxAmount.toFixed(2),
      });
      generatedAt = new Date();
    }

    const compliance = await tx.invoiceCompliance.create({
      data: {
        companyId,
        invoiceId: invoice.id,
        status: 'not_submitted',
        qrCode,
        generatedAt,
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'einvoice.compliance.generate',
      entityType: 'InvoiceCompliance',
      entityId: compliance.id,
      afterState: { invoiceId: invoice.id, qrGenerated: !!qrCode },
      // A missing VAT number is a real, expected data-completeness gap
      // (Company.vatNumber is optional at registration), not a system
      // error - worth a distinct audit-visible reason rather than a silent
      // null.
      reason: qrCode ? null : 'لا يوجد رقم تسجيل ضريبي مسجَّل للمنشأة - لم يُنشأ رمز QR',
    });

    return compliance;
  }
}
