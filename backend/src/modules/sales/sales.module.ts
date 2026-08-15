import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IamModule } from '../iam/iam.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceNumberService } from './invoice-number.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [AuditModule, IamModule, InventoryModule],
  controllers: [SalesController, InvoicesController],
  providers: [SalesService, InvoicesService, InvoiceNumberService],
  exports: [SalesService, InvoicesService],
})
export class SalesModule {}
