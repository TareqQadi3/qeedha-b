import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { AuthLookupService } from '../auth/auth-lookup.service';
import { hashToken } from '../../common/utils/token-hash';
import {
  INTEGRATION_TOKEN_SEPARATOR,
  QEEDHA_PROVIDER_KEY,
} from './constants/qeedha-integration.constants';

export interface AuthenticatedIntegrationConnection {
  connectionId: string;
  companyId: string;
  systemMembershipId: string;
  publicReference: string;
}

/**
 * Authenticates EXTERNAL callers (Qeedha, or a test harness standing in for
 * it) against the secret QeedhaConnectionService.link minted - completely
 * separate from JwtAuthGuard/the merchant session model. Only applied via
 * `@UseGuards()` on QeedhaTransactionController, never registered globally.
 *
 * Token shape: `Authorization: Bearer <publicReference>.<secret>`. The
 * `publicReference` half is looked up via the SAME bootstrap-role pattern
 * `AuthLookupService` already uses for pre-tenant-context human login
 * (`integration_connections` carries FORCE ROW LEVEL SECURITY, so the
 * normal app role cannot read it without already knowing app.tenant_id -
 * see prisma/manual-sql/003_auth_lookup_role_integration.sql). Company
 * context for every downstream call comes ONLY from the resolved
 * connection - "Never trust client-supplied companyId" (Milestone 9 spec
 * section 4) is enforced structurally: no route under this guard even
 * accepts a companyId parameter.
 */
@Injectable()
export class QeedhaIntegrationAuthGuard implements CanActivate {
  constructor(private readonly authLookupService: AuthLookupService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('رمز الوصول مفقود');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const separatorIndex = token.indexOf(INTEGRATION_TOKEN_SEPARATOR);
    if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
      throw new UnauthorizedException('صيغة رمز الوصول غير صحيحة');
    }
    const publicReference = token.slice(0, separatorIndex);
    const secret = token.slice(separatorIndex + 1);

    const connection =
      await this.authLookupService.findIntegrationConnectionByPublicReference(publicReference);
    if (!connection || connection.providerKey !== QEEDHA_PROVIDER_KEY) {
      throw new UnauthorizedException('رمز الوصول غير صالح');
    }
    if (
      connection.status !== 'connected' ||
      !connection.secretHash ||
      !connection.systemMembershipId ||
      !connection.publicReference
    ) {
      throw new UnauthorizedException('هذا الربط غير نشط - تم إيقافه أو لم يكتمل بعد');
    }

    // Constant-time comparison - same reasoning as any secret/token check in
    // this codebase (avoids leaking hash-prefix-match timing to a caller
    // probing for a valid secret).
    const presentedHash = hashToken(secret);
    const storedHashBuffer = Buffer.from(connection.secretHash, 'hex');
    const presentedHashBuffer = Buffer.from(presentedHash, 'hex');
    const matches =
      storedHashBuffer.length === presentedHashBuffer.length &&
      timingSafeEqual(storedHashBuffer, presentedHashBuffer);
    if (!matches) {
      throw new UnauthorizedException('رمز الوصول غير صالح');
    }

    const authenticatedConnection: AuthenticatedIntegrationConnection = {
      connectionId: connection.id,
      companyId: connection.companyId,
      systemMembershipId: connection.systemMembershipId,
      publicReference: connection.publicReference,
    };
    request.integrationConnection = authenticatedConnection;
    return true;
  }
}
