import { Injectable } from '@nestjs/common';

export interface Phase1QrFields {
  /** Company.legalName */
  sellerName: string;
  /** Company.vatNumber - caller must not call this with an empty value, see EInvoiceService. */
  vatNumber: string;
  /** ISO 8601, e.g. "2024-05-01T12:30:00" */
  timestamp: string;
  /** Invoice total INCLUDING VAT, formatted as a plain decimal string (e.g. "115.00") - never a float. */
  invoiceTotal: string;
  /** Total VAT amount, formatted as a plain decimal string (e.g. "15.00"). */
  vatTotal: string;
}

// Tag numbers 1-5 are ZATCA Phase 1's published QR fields for simplified tax
// invoices (seller name, VAT registration number, timestamp, invoice total,
// VAT total) - see docs/ZATCA.md "QR Code (Phase 1)" for the sourcing.
const TAGS = {
  sellerName: 1,
  vatNumber: 2,
  timestamp: 3,
  invoiceTotal: 4,
  vatTotal: 5,
} as const;

/**
 * ZATCA Phase 1 QR code encoder: TLV (Tag-Length-Value), Base64-encoded.
 * Each field is 1 byte tag + 1 byte length (the BYTE length of the UTF-8
 * value, not its character count - matters for Arabic seller names) + the
 * UTF-8 value itself; all five fields are concatenated into one buffer, then
 * the whole buffer is Base64-encoded as the QR code's text content. This is
 * a pure function with no I/O - see docs/ZATCA.md for how this was verified
 * against publicly documented ZATCA specifications (direct access to
 * zatca.gov.sa was blocked in this sandbox; verified instead against
 * multiple independent secondary technical sources - see docs/ZATCA.md for
 * the exact list. This is Phase 1 (Generation) only: no signing, no
 * cryptographic stamp, no submission - those are Phase 2 (Integration) and
 * are NOT implemented, see EInvoiceService).
 */
@Injectable()
export class TlvQrService {
  encode(fields: Phase1QrFields): string {
    const buffers = [
      this.encodeField(TAGS.sellerName, fields.sellerName),
      this.encodeField(TAGS.vatNumber, fields.vatNumber),
      this.encodeField(TAGS.timestamp, fields.timestamp),
      this.encodeField(TAGS.invoiceTotal, fields.invoiceTotal),
      this.encodeField(TAGS.vatTotal, fields.vatTotal),
    ];
    return Buffer.concat(buffers).toString('base64');
  }

  private encodeField(tag: number, value: string): Buffer {
    const valueBytes = Buffer.from(value, 'utf8');
    if (valueBytes.length > 255) {
      // The length byte is a single octet (max 255) - no current field can
      // realistically hit this, but encoding a truncated/wrapped length
      // would silently produce an invalid QR, so this fails loudly instead.
      throw new Error(`قيمة الحقل الطويلة جدًا لترميز TLV (tag ${tag}): ${valueBytes.length} بايت`);
    }
    return Buffer.concat([Buffer.from([tag]), Buffer.from([valueBytes.length]), valueBytes]);
  }
}
