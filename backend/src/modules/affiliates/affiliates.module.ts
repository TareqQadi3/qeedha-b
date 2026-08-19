import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AffiliateAuthGuard } from './affiliate-auth.guard';
import { AffiliatesController } from './affiliates.controller';
import { AffiliatesService } from './affiliates.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AffiliatesController],
  providers: [AffiliatesService, AffiliateAuthGuard],
  exports: [AffiliatesService],
})
export class AffiliatesModule {}
