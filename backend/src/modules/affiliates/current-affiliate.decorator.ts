import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedAffiliate } from './affiliate-auth.guard';

export const CurrentAffiliate = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAffiliate => {
    const request = ctx.switchToHttp().getRequest();
    return request.affiliate as AuthenticatedAffiliate;
  },
);
