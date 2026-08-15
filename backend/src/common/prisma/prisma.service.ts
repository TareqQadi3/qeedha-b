import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

export type TenantClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Wraps the raw PrismaClient (app DB role, RLS FORCE-enabled on every
 * tenant-owned table). Two entry points, chosen deliberately per call site
 * so intent is explicit in the code rather than implicit:
 *
 * - withTenant(companyId, fn): the default for all tenant-owned data. Opens
 *   a transaction, sets `app.tenant_id` for that transaction only (SET
 *   LOCAL), then runs fn. Postgres RLS enforces the company_id filter
 *   independently of whatever WHERE clause fn's queries do or don't have.
 *
 * - withoutTenant(fn): explicit escape hatch for genuinely global data
 *   (permissions catalog, integration_providers catalog) and for the one
 *   bootstrap moment where a brand-new company doesn't exist yet
 *   (AuthService.registerCompany pre-generates the id and immediately opens
 *   withTenant(newCompanyId, ...) instead - see that service). Every other
 *   use of withoutTenant is a smell and should be justified in a comment.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    super({
      datasources: { db: { url: config.get<string>('DATABASE_URL') } },
      log: config.get<string>('NODE_ENV') === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async withTenant<T>(companyId: string, fn: (tx: TenantClient) => Promise<T>): Promise<T> {
    if (!companyId) {
      throw new Error('withTenant() called without a companyId - refusing to run unscoped.');
    }

    return this.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT set_config('app.tenant_id', ${companyId}, true)`);
      return fn(tx);
    });
  }

  async withoutTenant<T>(fn: (tx: TenantClient) => Promise<T>): Promise<T> {
    this.logger.debug('withoutTenant() used - verify this call site is genuinely tenant-global.');
    return fn(this);
  }
}
