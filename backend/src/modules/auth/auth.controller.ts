import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { SelectTenantDto } from './dto/select-tenant.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('register-company')
  registerCompany(@Body() dto: RegisterCompanyDto) {
    return this.authService.registerCompany(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** Completes login for a user with more than one Membership (see AuthService.login). */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('select-tenant')
  selectTenant(@Body() dto: SelectTenantDto) {
    return this.authService.selectTenant(dto);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: Partial<RefreshDto>) {
    return this.authService.logout(user.userId, dto?.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }

  /** Companies this user could switch to - tenant switcher UI foundation. */
  @Get('tenants')
  listMyTenants(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listMyTenants(user.userId);
  }

  /** Switches the current session to a different company this user is a member of. */
  @HttpCode(HttpStatus.OK)
  @Post('switch-tenant')
  switchTenant(@CurrentUser() user: AuthenticatedUser, @Body() dto: SwitchTenantDto) {
    return this.authService.switchTenant(user.userId, dto.companyId);
  }
}
