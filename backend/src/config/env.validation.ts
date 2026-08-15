import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, Min, validateSync } from 'class-validator';

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

  @IsString()
  INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: string;
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

  return validated;
}
