import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PartiesModule } from '../parties/parties.module';
import { StorageModule } from '../storage/storage.module';
import { ExcelParserService } from './excel-parser.service';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [AuditModule, StorageModule, CatalogModule, InventoryModule, PartiesModule],
  controllers: [ImportsController],
  providers: [ImportsService, ExcelParserService],
})
export class ImportsModule {}
