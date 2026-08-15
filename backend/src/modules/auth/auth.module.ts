import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { IamModule } from '../iam/iam.module';
import { AuthLookupPrismaService } from '../../common/prisma/auth-lookup-prisma.service';
import { AuthLookupService } from './auth-lookup.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), IamModule],
  controllers: [AuthController],
  providers: [AuthService, AuthLookupService, AuthLookupPrismaService, JwtStrategy],
})
export class AuthModule {}
