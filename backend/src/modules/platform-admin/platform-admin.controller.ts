import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CreateCompanyByAdminDto } from './dto/create-company-by-admin.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { CreateMarketDto, UpdateMarketDto } from './dto/market.dto';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { PlatformAdminLoginDto } from './dto/platform-admin-login.dto';
import {
  ChangeSubscriptionPlanDto,
  ExtendTrialDto,
  SetSubscriptionStatusDto,
} from './dto/subscription-actions.dto';
import { SetApplicationStatusDto, SetCommissionStatusDto } from './dto/status-update.dto';
import { CurrentPlatformAdmin } from './current-platform-admin.decorator';
import { AuthenticatedPlatformAdmin, PlatformAdminAuthGuard } from './platform-admin-auth.guard';
import { PlatformAdminRoleGuard } from './platform-admin-role.guard';
import { RequirePlatformAdminRole } from './require-platform-admin-role.decorator';
import { PlatformAdminService } from './platform-admin.service';

/**
 * The SaaS control-panel API - a completely separate trust boundary from
 * every other controller in this app (see PlatformAdminAuthGuard).
 * `@Public()` on the whole controller so the global JwtAuthGuard (which
 * only knows the tenant/Membership session model) never runs here;
 * PlatformAdminAuthGuard + PlatformAdminRoleGuard are applied explicitly
 * instead, same pattern as QeedhaTransactionController for the same
 * reason. `@RequirePlatformAdminRole(...)` further restricts a route to
 * specific roles - `admin` always passes (Website phase spec "Staff /
 * Admin Users").
 */
@Public()
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  // ---- Auth (login is the one route with NO guard - nothing to authenticate yet) ----

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

  // ---- Overview ----

  @UseGuards(PlatformAdminAuthGuard)
  @Get('overview')
  getOverview() {
    return this.platformAdminService.getOverview();
  }

  // ---- Merchants ----

  @UseGuards(PlatformAdminAuthGuard)
  @Get('companies')
  listMerchants() {
    return this.platformAdminService.listMerchants();
  }

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('finance')
  @Post('companies')
  createCompany(@Body() dto: CreateCompanyByAdminDto) {
    return this.platformAdminService.createCompany(dto);
  }

  // ---- Subscription lifecycle (finance role) ----

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('finance')
  @HttpCode(HttpStatus.OK)
  @Post('companies/:companyId/subscription/status')
  setSubscriptionStatus(
    @Param('companyId') companyId: string,
    @Body() dto: SetSubscriptionStatusDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.platformAdminService.setSubscriptionStatus(companyId, dto.status, admin.adminId);
  }

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('finance')
  @HttpCode(HttpStatus.OK)
  @Post('companies/:companyId/subscription/plan')
  changeSubscriptionPlan(
    @Param('companyId') companyId: string,
    @Body() dto: ChangeSubscriptionPlanDto,
  ) {
    return this.platformAdminService.changeSubscriptionPlan(companyId, dto.planCode);
  }

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('finance')
  @HttpCode(HttpStatus.OK)
  @Post('companies/:companyId/subscription/extend-trial')
  extendTrial(@Param('companyId') companyId: string, @Body() dto: ExtendTrialDto) {
    return this.platformAdminService.extendSubscriptionTrial(companyId, dto.days);
  }

  // ---- Plans / Packages (admin role only) ----

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('admin')
  @Get('plans')
  listAllPlans() {
    return this.platformAdminService.listAllPlans();
  }

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('admin')
  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.platformAdminService.createPlan(dto);
  }

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('admin')
  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.platformAdminService.updatePlan(id, dto);
  }

  // ---- Markets (admin role only) ----

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('admin')
  @Get('markets')
  listAllMarkets() {
    return this.platformAdminService.listAllMarkets();
  }

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('admin')
  @Post('markets')
  createMarket(@Body() dto: CreateMarketDto) {
    return this.platformAdminService.createMarket(dto);
  }

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('admin')
  @Patch('markets/:code')
  updateMarket(@Param('code') code: string, @Body() dto: UpdateMarketDto) {
    return this.platformAdminService.updateMarket(code, dto);
  }

  // ---- Affiliates (finance or marketing) ----

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('finance', 'marketing')
  @Get('affiliates')
  listAffiliates() {
    return this.platformAdminService.listAffiliates();
  }

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('finance')
  @Patch('affiliates/commissions/:commissionId')
  setCommissionStatus(
    @Param('commissionId') commissionId: string,
    @Body() dto: SetCommissionStatusDto,
  ) {
    return this.platformAdminService.setCommissionStatus(commissionId, dto.status);
  }

  // ---- Applications (marketing or support) ----

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('marketing', 'support')
  @Get('applications')
  listApplications() {
    return this.platformAdminService.listApplications();
  }

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('marketing', 'support')
  @Patch('applications/:id')
  setApplicationStatus(@Param('id') id: string, @Body() dto: SetApplicationStatusDto) {
    return this.platformAdminService.setApplicationStatus(id, dto.status);
  }

  // ---- Staff (admin role only) ----

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('admin')
  @Get('staff')
  listStaff() {
    return this.platformAdminService.listStaff();
  }

  @UseGuards(PlatformAdminAuthGuard, PlatformAdminRoleGuard)
  @RequirePlatformAdminRole('admin')
  @Post('staff')
  createStaff(@Body() dto: CreateStaffDto) {
    return this.platformAdminService.createStaff(dto);
  }
}
