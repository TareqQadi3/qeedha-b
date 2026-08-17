import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedIntegrationConnection } from './qeedha-integration-auth.guard';

/** Mirrors `@CurrentUser()` - reads what `QeedhaIntegrationAuthGuard` attached, never anything client-supplied. */
export const CurrentIntegrationConnection = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedIntegrationConnection => {
    const request = ctx.switchToHttp().getRequest();
    return request.integrationConnection;
  },
);
