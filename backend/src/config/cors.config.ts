import { ConfigService } from '@nestjs/config';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Environment-driven CORS (Milestone 2 "CORS — CRITICAL"): previously
 * `app.enableCors()` with no options, which reflects/allows any origin. No
 * wildcard is ever accepted here, in any environment - `CORS_ALLOWED_ORIGINS`
 * is always an explicit, comma-separated allowlist.
 *
 * - production: `CORS_ALLOWED_ORIGINS` is REQUIRED - fails fast at startup
 *   (see main.ts) rather than silently falling back to an open policy.
 * - development/test: falls back to the standard local Vite ports if unset,
 *   for zero-friction local dev - still an explicit list, never a wildcard.
 */
export function buildCorsOptions(config: ConfigService): CorsOptions {
  const raw = config.get<string>('CORS_ALLOWED_ORIGINS');
  const configured = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const nodeEnv = config.get<string>('NODE_ENV');
  const origins =
    configured.length > 0
      ? configured
      : nodeEnv === 'production'
        ? []
        : ['http://localhost:5173', 'http://localhost:4173'];

  return {
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
}

/** Called once at startup - refuses to boot with an open/empty CORS policy in production. */
export function assertCorsConfiguredForProduction(config: ConfigService): void {
  if (config.get<string>('NODE_ENV') !== 'production') return;
  const raw = config.get<string>('CORS_ALLOWED_ORIGINS');
  const hasOrigins = (raw ?? '').split(',').some((o) => o.trim().length > 0);
  if (!hasOrigins) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS يجب أن يكون معرَّفًا في بيئة الإنتاج (قائمة origins مفصولة بفواصل) - رفض البدء بسياسة CORS مفتوحة أو فارغة.',
    );
  }
}
