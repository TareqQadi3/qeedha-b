import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AFFILIATE_JWT_SCOPE } from './affiliates.service';

export interface AuthenticatedAffiliate {
  affiliateId: string;
}

interface AffiliateTokenPayload {
  sub: string;
  scope: string;
}

/**
 * Authenticates the affiliate self-service dashboard actor (Phase 9
 * "Affiliate Dashboard") - a THIRD, completely separate trust boundary
 * from both the tenant Membership session and the PlatformAdmin control
 * panel session, following the exact same isolation pattern as
 * PlatformAdminAuthGuard: its own secret (JWT_AFFILIATE_SECRET), its own
 * scope check, applied via `@UseGuards()` + `@Public()` so the global
 * JwtAuthGuard never runs on these routes. An affiliate token must never
 * be accepted on a merchant or Control Center route, and vice versa.
 */
@Injectable()
export class AffiliateAuthGuard implements CanActivate {
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

    let payload: AffiliateTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AffiliateTokenPayload>(token, {
        secret: this.config.get<string>('JWT_AFFILIATE_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('رمز الوصول غير صالح أو منتهي الصلاحية');
    }
    if (payload.scope !== AFFILIATE_JWT_SCOPE) {
      throw new UnauthorizedException('رمز غير صالح لهذا الغرض');
    }

    const authenticatedAffiliate: AuthenticatedAffiliate = { affiliateId: payload.sub };
    request.affiliate = authenticatedAffiliate;
    return true;
  }
}
