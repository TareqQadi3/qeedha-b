import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CreateCompanyByAdminDto } from './dto/create-company-by-admin.dto';
import { PlatformAdminLoginDto } from './dto/platform-admin-login.dto';
import { CurrentPlatformAdmin } from './current-platform-admin.decorator';
import { AuthenticatedPlatformAdmin, PlatformAdminAuthGuard } from './platform-admin-auth.guard';
import { PlatformAdminService } from './platform-admin.service';

/**
 * The SaaS control-panel API - a completely separate trust boundary from
 * every other controller in this app (see PlatformAdminAuthGuard).
 * `@Public()` on the whole controller so the global JwtAuthGuard (which
 * only knows the tenant/Membership session model) never runs here;
 * PlatformAdminAuthGuard is applied explicitly instead, same pattern as
 * QeedhaTransactionController for the same reason.
 */
@Public()
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('auth/login')
  login(@Body() dto: PlatformAdminLoginDto) {
    return this.platformAdminService.login(dto);
  }

  @UseGuards(PlatformAdminAuthGuard)
  @Get('auth/me')
  me(@CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return this.platformAdminService.me(admin.adminId);
  }

  @UseGuards(PlatformAdminAuthGuard)
  @Get('companies')
  listCompanies() {
    return this.platformAdminService.listCompanies();
  }

  @UseGuards(PlatformAdminAuthGuard)
  @Post('companies')
  createCompany(@Body() dto: CreateCompanyByAdminDto) {
    return this.platformAdminService.createCompany(dto);
  }
}
