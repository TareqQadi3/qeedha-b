import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/**
 * A third, deliberately narrow PrismaClient connected as the
 * `qeedha_platform_admin` Postgres role (BYPASSRLS, SELECT-only on a
 * handful of `companies` columns - see
 * prisma/manual-sql/004_platform_admin_role.sql).
 *
 * Why this exists, and why it's not just a wider grant on the existing
 * `qeedha_auth_lookup` role: the SaaS admin control panel needs to list
 * companies ACROSS every tenant, structurally the same "no tenant context
 * yet" problem as the login bootstrap - but `qeedha_auth_lookup` is
 * documented and used ONLY by AuthLookupService for that one purpose.
 * Reusing it here would quietly grow its blast radius for an unrelated
 * feature. A second single-purpose role keeps each one's privileges
 * exactly as narrow as what it's actually for.
 *
 * Only PlatformAdminService may use this. Nothing else should inject it.
 */
@Injectable()
export class PlatformAdminPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      datasources: { db: { url: config.get<string>('PLATFORM_ADMIN_DATABASE_URL') } },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
