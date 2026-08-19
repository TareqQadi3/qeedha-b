import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { IamModule } from '../iam/iam.module';
import { AccountingModule } from '../accounting/accounting.module';
import { EmailModule } from '../email/email.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AuthLookupPrismaService } from '../../common/prisma/auth-lookup-prisma.service';
import { AuthLookupService } from './auth-lookup.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    IamModule,
    AccountingModule,
    SubscriptionsModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthLookupService, AuthLookupPrismaService, JwtStrategy],
  // Milestone 9: QeedhaIntegrationAuthGuard needs the same pre-tenant-context
  // bootstrap lookup human login already uses - see AuthLookupService.
  // AuthService: PlatformAdminService reuses createCompanyWithOwner (the SaaS
  // admin control panel creates merchant companies the same way self-registration
  // does - see docs/DOMAIN_MODEL.md "Platform admin").
  exports: [AuthLookupService, AuthService],
})
export class AuthModule {}
