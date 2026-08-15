import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Correlation ID for every request (Milestone 2 "Logging"): reuses an
 * inbound `x-request-id` if the caller/proxy already set one, otherwise
 * generates a fresh UUID. Attached to `req` for LoggingInterceptor to read,
 * and echoed back on the response header so a client/support ticket can
 * reference the exact request.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string | undefined) || randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
