import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EInvoiceService } from './einvoice.service';
import { TlvQrService } from './tlv-qr.service';

@Module({
  imports: [AuditModule],
  providers: [EInvoiceService, TlvQrService],
  exports: [EInvoiceService],
})
export class EInvoiceModule {}
