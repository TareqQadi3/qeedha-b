import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/** Uniform error envelope for every response, matching docs/API.md. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttpException ? exception.getResponse() : null;

    const code = isHttpException
      ? exception.constructor.name.replace(/Exception$/, '').toUpperCase()
      : 'INTERNAL_ERROR';
    let message = 'حدث خطأ غير متوقع';
    let details: unknown = null;

    if (typeof body === 'string') {
      message = body;
    } else if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      message = Array.isArray(b.message)
        ? (b.message as string[]).join('; ')
        : ((b.message as string) ?? message);
      details = Array.isArray(b.message) ? b.message : null;
    }

    if (!isHttpException) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    response.status(status).json({ error: { code, message, details } });
  }
}
