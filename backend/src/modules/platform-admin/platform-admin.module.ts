import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformAdminPrismaService } from '../../common/prisma/platform-admin-prisma.service';
import { AuthModule } from '../auth/auth.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminAuthGuard } from './platform-admin-auth.guard';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [JwtModule.register({}), AuthModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, PlatformAdminPrismaService, PlatformAdminAuthGuard],
})
export class PlatformAdminModule {}
