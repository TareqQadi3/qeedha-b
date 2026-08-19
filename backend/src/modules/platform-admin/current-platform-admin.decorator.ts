import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedPlatformAdmin } from './platform-admin-auth.guard';

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPlatformAdmin => {
    const request = ctx.switchToHttp().getRequest();
    return request.platformAdmin as AuthenticatedPlatformAdmin;
  },
);
