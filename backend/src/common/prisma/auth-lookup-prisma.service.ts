import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/**
 * A second, deliberately narrow PrismaClient connected as the
 * `qeedha_auth_lookup` Postgres role (BYPASSRLS, SELECT-only on a handful of
 * `memberships`/`companies` columns - see
 * prisma/manual-sql/001_auth_lookup_role.sql and
 * prisma/manual-sql/002_auth_lookup_role_update.sql).
 *
 * Why this exists: after verifying a password, AuthService still needs to
 * know which companies this user can choose from *before* any tenant
 * context exists - but `memberships` and `companies` are RLS-FORCEd, and
 * the normal app role has no way to set app.tenant_id for a company it
 * doesn't know yet. Rather than granting the main app role BYPASSRLS (which
 * would quietly defeat RLS as a backstop for every other query in the
 * system), only this single-purpose, minimally-privileged connection can
 * bypass it - and Postgres GRANTs mean it physically cannot read anything
 * beyond the columns AuthService needs, even if application code has a bug.
 * (`users` itself is no longer RLS-protected at all post-refactor - see
 * docs/DOMAIN_MODEL.md - so credential lookup no longer needs this client.)
 *
 * Only AuthLookupService may use this. Nothing else should inject it.
 */
@Injectable()
export class AuthLookupPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      datasources: { db: { url: config.get<string>('AUTH_LOOKUP_DATABASE_URL') } },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
