/**
 * Milestone 9 (docs/QEEDHA_INTEGRATION.md): the single provider key this
 * whole module operates under. `integration_providers.key = 'qeedha'` was
 * reserved for exactly this since Phase 1 - see the comment on
 * IntegrationProvider.key in schema.prisma ("registered later").
 */
export const QEEDHA_PROVIDER_KEY = 'qeedha';

/** Seeded once via prisma/seed.ts - see IntegrationProvider catalog row. */
export const QEEDHA_PROVIDER_NAME = 'قيّدها';

/**
 * The ONE global system Membership role assigned to the non-human
 * "Qeedha Integration" system User in every company that links a
 * connection - see default-roles.ts "Integration" and
 * docs/QEEDHA_INTEGRATION.md "System actor" for why this exists (reusing
 * Membership/RBAC/BranchScopeService/Audit instead of inventing a second
 * actor concept for integration-originated business actions).
 */
export const INTEGRATION_SYSTEM_ROLE_NAME = 'Integration';

/**
 * Fixed, globally-unique identity for the ONE system User every company's
 * Qeedha connection shares as its actor (see prisma/seed.ts). Deliberately
 * not a real mailbox and `status: disabled` (blocks login outright, on top
 * of never having tokens issued for it) - see
 * QeedhaConnectionService.ensureSystemMembership.
 */
export const INTEGRATION_SYSTEM_USER_EMAIL = 'system+qeedha-integration@qeedha-b.internal';
export const INTEGRATION_SYSTEM_USER_FULL_NAME = 'نظام تكامل قيّدها';

/** Bearer token shape this module issues/verifies: `<publicReference>.<secret>` - see QeedhaIntegrationAuthGuard. */
export const INTEGRATION_TOKEN_SEPARATOR = '.';

/** Prefix on every minted `publicReference` - purely cosmetic/recognizable, carries no internal meaning. */
export const INTEGRATION_PUBLIC_REFERENCE_PREFIX = 'qic_';
