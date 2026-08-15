import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [AuditModule],
  controllers: [CustomersController, SuppliersController],
  providers: [CustomersService, SuppliersService],
  exports: [CustomersService, SuppliersService],
})
export class PartiesModule {}
