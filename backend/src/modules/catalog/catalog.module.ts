import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [AuditModule],
  controllers: [CatalogController, ProductsController],
  providers: [CatalogService, ProductsService],
  exports: [CatalogService, ProductsService],
})
export class CatalogModule {}
