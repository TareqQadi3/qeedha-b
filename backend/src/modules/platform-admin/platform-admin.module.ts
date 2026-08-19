import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformAdminPrismaService } from '../../common/prisma/platform-admin-prisma.service';
import { AffiliatesModule } from '../affiliates/affiliates.module';
import { AuthModule } from '../auth/auth.module';
import { CareersModule } from '../careers/careers.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminAuthGuard } from './platform-admin-auth.guard';
import { PlatformAdminRoleGuard } from './platform-admin-role.guard';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [
    JwtModule.register({}),
    AuthModule,
    SubscriptionsModule,
    AffiliatesModule,
    CareersModule,
  ],
  controllers: [PlatformAdminController],
  providers: [
    PlatformAdminService,
    PlatformAdminPrismaService,
    PlatformAdminAuthGuard,
    PlatformAdminRoleGuard,
  ],
})
export class PlatformAdminModule {}
