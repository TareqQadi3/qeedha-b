import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IamModule } from '../iam/iam.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockCountService } from './stock-count.service';

@Module({
  imports: [AuditModule, IamModule],
  controllers: [InventoryController],
  providers: [InventoryService, StockCountService],
  exports: [InventoryService, StockCountService],
})
export class InventoryModule {}
