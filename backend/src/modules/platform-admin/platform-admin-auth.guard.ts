import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PLATFORM_ADMIN_JWT_SCOPE } from './platform-admin.service';

export interface AuthenticatedPlatformAdmin {
  adminId: string;
}

interface PlatformAdminTokenPayload {
  sub: string;
  scope: string;
}

/**
 * Authenticates the SaaS control-panel actor - completely separate from
 * JwtAuthGuard/the tenant Membership session model, on purpose (see
 * PlatformAdmin in schema.prisma). Only applied via `@UseGuards()` +
 * `@Public()` on PlatformAdminController (same pattern as
 * QeedhaIntegrationAuthGuard for the same reason: a genuinely different
 * trust boundary must never share JwtAuthGuard's default 'jwt' strategy,
 * or a bug there could accept a tenant access token here or vice versa).
 * A separate secret (JWT_PLATFORM_ADMIN_SECRET) makes token confusion
 * between the two systems fail closed even if the scope check below were
 * ever removed by mistake.
 */
@Injectable()
export class PlatformAdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('رمز الوصول مفقود');
    }
    const token = authHeader.slice('Bearer '.length).trim();

    let payload: PlatformAdminTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<PlatformAdminTokenPayload>(token, {
        secret: this.config.get<string>('JWT_PLATFORM_ADMIN_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('رمز الوصول غير صالح أو منتهي الصلاحية');
    }
    if (payload.scope !== PLATFORM_ADMIN_JWT_SCOPE) {
      throw new UnauthorizedException('رمز غير صالح لهذا الغرض');
    }

    const authenticatedAdmin: AuthenticatedPlatformAdmin = { adminId: payload.sub };
    request.platformAdmin = authenticatedAdmin;
    return true;
  }
}
