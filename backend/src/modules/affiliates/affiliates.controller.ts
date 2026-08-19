import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AffiliateAuthGuard, AuthenticatedAffiliate } from './affiliate-auth.guard';
import { AffiliatesService } from './affiliates.service';
import { CurrentAffiliate } from './current-affiliate.decorator';
import { AffiliateLoginDto } from './dto/affiliate-login.dto';
import { RegisterAffiliateDto } from './dto/register-affiliate.dto';

/**
 * Public self-service affiliate registration/login (Website phase spec
 * "Affiliate system"; Phase 9 "Affiliate Dashboard") plus the affiliate's
 * own dashboard - admin listing/commission management stays on
 * PlatformAdminController only (an affiliate can never reach those routes:
 * AffiliateAuthGuard/PlatformAdminAuthGuard accept only their own token).
 * `@Public()` at the class level (the global JwtAuthGuard only knows the
 * tenant/Membership session), individual routes opt into
 * AffiliateAuthGuard - same per-route guard pattern
 * PlatformAdminController uses for the same "one route must stay
 * reachable with no token yet" reason (login).
 */
@Public()
@Controller('affiliates')
export class AffiliatesController {
  constructor(private readonly affiliatesService: AffiliatesService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  register(@Body() dto: RegisterAffiliateDto) {
    return this.affiliatesService.register(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: AffiliateLoginDto) {
    return this.affiliatesService.login(dto);
  }

  @UseGuards(AffiliateAuthGuard)
  @Get('me')
  me(@CurrentAffiliate() affiliate: AuthenticatedAffiliate) {
    return this.affiliatesService.me(affiliate.affiliateId);
  }

  @UseGuards(AffiliateAuthGuard)
  @Get('dashboard')
  dashboard(@CurrentAffiliate() affiliate: AuthenticatedAffiliate) {
    return this.affiliatesService.getDashboard(affiliate.affiliateId);
  }
}
