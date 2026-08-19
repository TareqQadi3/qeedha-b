import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  AUTH_LOOKUP_DATABASE_URL: string;

  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_ACCESS_TTL: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_REFRESH_TTL: string;

  // Signs the short-lived, single-purpose token issued between password
  // verification and tenant selection for users with more than one
  // Membership. Deliberately a separate secret from JWT_ACCESS_SECRET so a
  // guard bug can never mistake one for the other - see AuthService.
  @IsString()
  JWT_TENANT_SELECTION_SECRET: string;

  @IsString()
  JWT_TENANT_SELECTION_TTL: string;

  // Third, narrowly-scoped Postgres connection (qeedha_platform_admin role,
  // BYPASSRLS + SELECT on `companies` only) - see
  // prisma/manual-sql/004_platform_admin_role.sql and PlatformAdminPrismaService.
  @IsString()
  PLATFORM_ADMIN_DATABASE_URL: string;

  // Signs the SaaS control-panel session token - deliberately independent
  // from every tenant-session secret above (see PlatformAdminAuthGuard).
  @IsString()
  JWT_PLATFORM_ADMIN_SECRET: string;

  @IsString()
  JWT_PLATFORM_ADMIN_TTL: string;

  // Optional: if both are set, prisma/seed.ts upserts one PlatformAdmin on
  // startup so there's a way to log into the control panel at all -
  // platform admins are never self-registered. Leave unset in an
  // environment that shouldn't get one seeded automatically.
  @IsOptional()
  @IsString()
  PLATFORM_ADMIN_SEED_EMAIL?: string;

  @IsOptional()
  @IsString()
  PLATFORM_ADMIN_SEED_PASSWORD?: string;

  @IsString()
  INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: string;

  // Comma-separated allowlist of origins the API accepts CORS requests
  // from (docs/SECURITY.md "CORS"). Optional in development/test (falls
  // back to the local Vite ports - see config/cors.config.ts); a missing
  // or empty value is a hard startup failure in production
  // (assertCorsConfiguredForProduction), never a silent wildcard.
  @IsOptional()
  @IsString()
  CORS_ALLOWED_ORIGINS?: string;

  // File storage driver for Excel Import uploads (docs/IMPORT_EXCEL.md "File
  // Storage") - only "local" is implemented; see StorageModule. Optional,
  // defaults to "local".
  @IsOptional()
  @IsString()
  STORAGE_DRIVER?: string;

  // Local-disk directory the "local" storage driver writes uploaded files
  // under (never web-served, never inside the built frontend). Optional,
  // defaults to "./storage-data".
  @IsOptional()
  @IsString()
  STORAGE_LOCAL_DIR?: string;

  // Website phase: email provider driver - only "console" (log, no real
  // delivery) is implemented; see EmailModule. Optional, defaults to "console".
  @IsOptional()
  @IsString()
  EMAIL_DRIVER?: string;

  // Website phase: public frontend origin used to build links inside
  // transactional emails (e.g. the email-verification link) - see
  // EmailService.websiteBaseUrl. Optional, defaults to the local Vite dev
  // server origin.
  @IsOptional()
  @IsString()
  WEBSITE_BASE_URL?: string;
}

// Milestone 10 (production release hardening): the exact placeholder
// values shipped in `.env.example` - `@IsString()` alone happily accepts
// any of these copied verbatim into a real production `.env`. Never let
// that boot silently; see `assertSecretsProductionSafe` below.
const PLACEHOLDER_SECRET_VALUES = new Set([
  'change-me-access-secret',
  'change-me-refresh-secret',
  'change-me-tenant-selection-secret',
  'change-me-platform-admin-secret',
  'change-me-32-byte-base64-encryption-key==',
]);

const MIN_PRODUCTION_SECRET_LENGTH = 32;
const PRODUCTION_SECRET_KEYS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_TENANT_SELECTION_SECRET',
  'JWT_PLATFORM_ADMIN_SECRET',
  'INTEGRATION_CREDENTIALS_ENCRYPTION_KEY',
] as const;

/**
 * Fail-closed production secret check, same posture as
 * `assertCorsConfiguredForProduction` (config/cors.config.ts) - refuses to
 * boot rather than silently running with a weak/copy-pasted secret.
 * `.IsString()` in `EnvironmentVariables` above cannot express "not the
 * literal placeholder" or "long enough to be a real secret", so this runs
 * as a second pass, production-only, after the base validation succeeds.
 */
function assertSecretsProductionSafe(config: Record<string, unknown>) {
  if (config.NODE_ENV !== 'production') return;

  for (const key of PRODUCTION_SECRET_KEYS) {
    const value = String(config[key] ?? '');
    if (PLACEHOLDER_SECRET_VALUES.has(value)) {
      throw new Error(
        `${key} لا يزال يحمل القيمة الافتراضية من .env.example - يجب تعيين سرّ إنتاجي حقيقي قبل البدء في بيئة الإنتاج.`,
      );
    }
    if (value.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `${key} أقصر من الحد الأدنى الآمن (${MIN_PRODUCTION_SECRET_LENGTH} حرفًا) في بيئة الإنتاج.`,
      );
    }
  }

  // The three JWT secrets are deliberately independent by design (see
  // JWT_TENANT_SELECTION_SECRET's doc comment above) - reusing one value
  // for more than one purpose defeats that isolation even though each
  // value individually passes the checks above.
  const jwtSecrets = [
    String(config.JWT_ACCESS_SECRET),
    String(config.JWT_REFRESH_SECRET),
    String(config.JWT_TENANT_SELECTION_SECRET),
    String(config.JWT_PLATFORM_ADMIN_SECRET),
  ];
  if (new Set(jwtSecrets).size !== jwtSecrets.length) {
    throw new Error(
      'JWT_ACCESS_SECRET وJWT_REFRESH_SECRET وJWT_TENANT_SELECTION_SECRET وJWT_PLATFORM_ADMIN_SECRET يجب أن تكون قيمًا مختلفة تمامًا في بيئة الإنتاج.',
    );
  }
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `متغيرات البيئة غير صحيحة (Invalid environment configuration):\n${errors.toString()}`,
    );
  }

  assertSecretsProductionSafe(config);

  return validated;
}
