import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AccountingModule } from '../accounting/accounting.module';
import { EInvoiceModule } from '../einvoice/einvoice.module';
import { IamModule } from '../iam/iam.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceNumberService } from './invoice-number.service';
import { SalesController } from './sales.controller';
import { SalesReturnService } from './sales-return.service';
import { SalesService } from './sales.service';

@Module({
  imports: [AuditModule, IamModule, InventoryModule, AccountingModule, EInvoiceModule],
  controllers: [SalesController, InvoicesController],
  providers: [SalesService, SalesReturnService, InvoicesService, InvoiceNumberService],
  exports: [SalesService, SalesReturnService, InvoicesService],
})
export class SalesModule {}
