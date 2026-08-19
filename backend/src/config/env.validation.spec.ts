import 'reflect-metadata';
import { validateEnv } from './env.validation';

/**
 * Milestone 10 (production release hardening): `assertSecretsProductionSafe`
 * inside `validateEnv` is the only thing standing between a real production
 * deploy and someone copying `.env.example`'s placeholder secrets verbatim.
 * Covered here directly rather than only via `NODE_ENV=test`'s own .env.test
 * (which never exercises the production branch at all).
 */
describe('validateEnv - production secret hardening (Milestone 10)', () => {
  const baseConfig = {
    NODE_ENV: 'production',
    PORT: 3000,
    DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    AUTH_LOOKUP_DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    PLATFORM_ADMIN_DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    JWT_TENANT_SELECTION_TTL: '10m',
    JWT_PLATFORM_ADMIN_TTL: '8h',
    CORS_ALLOWED_ORIGINS: 'https://app.example.com',
  };

  const realSecret = (seed: string) => `${seed}-${'x'.repeat(32)}`;

  it('يرفض البدء في الإنتاج بأي سر لا يزال يحمل قيمة .env.example الافتراضية', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        JWT_ACCESS_SECRET: 'change-me-access-secret',
        JWT_REFRESH_SECRET: realSecret('refresh'),
        JWT_TENANT_SELECTION_SECRET: realSecret('tenant'),
        JWT_PLATFORM_ADMIN_SECRET: realSecret('platform-admin'),
        INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: realSecret('key'),
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('يرفض البدء في الإنتاج بسرّ أقصر من الحد الأدنى الآمن', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        JWT_ACCESS_SECRET: 'too-short',
        JWT_REFRESH_SECRET: realSecret('refresh'),
        JWT_TENANT_SELECTION_SECRET: realSecret('tenant'),
        JWT_PLATFORM_ADMIN_SECRET: realSecret('platform-admin'),
        INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: realSecret('key'),
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('يرفض البدء في الإنتاج إن تكرر نفس السر لأكثر من غرض JWT واحد', () => {
    const shared = realSecret('shared');
    expect(() =>
      validateEnv({
        ...baseConfig,
        JWT_ACCESS_SECRET: shared,
        JWT_REFRESH_SECRET: shared,
        JWT_TENANT_SELECTION_SECRET: realSecret('tenant'),
        JWT_PLATFORM_ADMIN_SECRET: realSecret('platform-admin'),
        INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: realSecret('key'),
      }),
    ).toThrow(/مختلفة تمامًا/);
  });

  it('يقبل البدء في الإنتاج بأسرار حقيقية طويلة ومختلفة', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        JWT_ACCESS_SECRET: realSecret('access'),
        JWT_REFRESH_SECRET: realSecret('refresh'),
        JWT_TENANT_SELECTION_SECRET: realSecret('tenant'),
        JWT_PLATFORM_ADMIN_SECRET: realSecret('platform-admin'),
        INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: realSecret('key'),
      }),
    ).not.toThrow();
  });

  it('لا يفرض هذا الفحص خارج بيئة الإنتاج - development يقبل نفس القيم الافتراضية', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: 'change-me-access-secret',
        JWT_REFRESH_SECRET: 'change-me-refresh-secret',
        JWT_TENANT_SELECTION_SECRET: 'change-me-tenant-selection-secret',
        JWT_PLATFORM_ADMIN_SECRET: 'change-me-platform-admin-secret',
        INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: 'change-me-32-byte-base64-encryption-key==',
      }),
    ).not.toThrow();
  });
});
