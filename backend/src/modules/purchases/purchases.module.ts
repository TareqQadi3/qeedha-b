import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AccountingModule } from '../accounting/accounting.module';
import { IamModule } from '../iam/iam.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseNumberService } from './purchase-number.service';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [AuditModule, IamModule, InventoryModule, AccountingModule],
  controllers: [PurchasesController],
  providers: [PurchasesService, PurchaseNumberService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
