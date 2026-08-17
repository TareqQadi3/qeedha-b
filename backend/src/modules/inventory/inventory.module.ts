import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';
import { IamModule } from '../iam/iam.module';
import { InventoryController } from './inventory.controller';
import { InventoryValuationService } from './inventory-valuation.service';
import { InventoryService } from './inventory.service';
import { StockCountService } from './stock-count.service';

@Module({
  imports: [AuditModule, IamModule, AccountingModule],
  controllers: [InventoryController],
  providers: [InventoryService, StockCountService, InventoryValuationService],
  exports: [InventoryService, StockCountService, InventoryValuationService],
})
export class InventoryModule {}
