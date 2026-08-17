import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PartiesModule } from '../parties/parties.module';
import { SalesModule } from '../sales/sales.module';
import { QeedhaConnectionController } from './qeedha-connection.controller';
import { QeedhaConnectionService } from './qeedha-connection.service';
import { QeedhaIntegrationAuthGuard } from './qeedha-integration-auth.guard';
import { QeedhaTransactionController } from './qeedha-transaction.controller';
import { QeedhaTransactionService } from './qeedha-transaction.service';

@Module({
  imports: [AuditModule, AuthModule, PartiesModule, SalesModule],
  controllers: [QeedhaConnectionController, QeedhaTransactionController],
  providers: [QeedhaConnectionService, QeedhaTransactionService, QeedhaIntegrationAuthGuard],
})
export class QeedhaIntegrationModule {}
