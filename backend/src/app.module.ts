import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { MembershipGuard } from './common/guards/membership.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { PrismaModule } from './common/prisma/prisma.module';
import { validateEnv } from './config/env.validation';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { HealthModule } from './modules/health/health.module';
import { IamModule } from './modules/iam/iam.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PartiesModule } from './modules/parties/parties.module';
import { SalesModule } from './modules/sales/sales.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { StorageModule } from './modules/storage/storage.module';
import { ImportsModule } from './modules/imports/imports.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    PrismaModule,
    HealthModule,
    AuditModule,
    IamModule,
    AuthModule,
    TenancyModule,
    IntegrationsModule,
    CatalogModule,
    InventoryModule,
    PartiesModule,
    SalesModule,
    AccountingModule,
    PurchasesModule,
    ExpensesModule,
    StorageModule,
    ImportsModule,
    SubscriptionsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MembershipGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
