import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * One structured (JSON) line per request (Milestone 2 "Logging"): method,
 * path, status, duration, correlation id (RequestIdMiddleware). Deliberately
 * never logs headers, query params, or the request/response body - the
 * fields that would carry a password, JWT, refresh token, or API key never
 * reach this interceptor in the first place. Not a full observability
 * platform - just enough to diagnose "what happened" in Demo/Staging.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request & { requestId?: string }>();
    const res = httpContext.getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(req, res, start),
        error: () => this.log(req, res, start),
      }),
    );
  }

  private log(req: Request & { requestId?: string }, res: Response, start: number) {
    const entry = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl?.split('?')[0],
      status: res.statusCode,
      durationMs: Date.now() - start,
    };
    this.logger.log(JSON.stringify(entry));
  }
}
