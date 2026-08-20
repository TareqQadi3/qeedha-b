import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PERMISSIONS } from '../src/modules/iam/constants/permissions';
import { SYSTEM_ROLES } from '../src/modules/iam/constants/default-roles';
import {
  DEFAULT_PLANS,
  planFeaturesJson,
} from '../src/modules/subscriptions/constants/default-plans';
import {
  INTEGRATION_SYSTEM_USER_EMAIL,
  INTEGRATION_SYSTEM_USER_FULL_NAME,
  QEEDHA_PROVIDER_KEY,
  QEEDHA_PROVIDER_NAME,
} from '../src/modules/qeedha-integration/constants/qeedha-integration.constants';
import { QEEDHA_PAYMENTS_PROVIDER_KEY } from '../src/modules/integrations/providers/qeedha-payment-provider';

const prisma = new PrismaClient();

async function main() {
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        description: plan.description,
        isActive: plan.isActive,
        trialEligible: plan.trialEligible,
        priceMonthlySar: plan.priceMonthlySar,
        billingInterval: plan.billingInterval,
        maxUsers: plan.maxUsers,
        maxBranches: plan.maxBranches,
        maxMonthlySales: plan.maxMonthlySales,
        features: planFeaturesJson(plan.features),
      },
      create: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        isActive: plan.isActive,
        trialEligible: plan.trialEligible,
        priceMonthlySar: plan.priceMonthlySar,
        billingInterval: plan.billingInterval,
        maxUsers: plan.maxUsers,
        maxBranches: plan.maxBranches,
        maxMonthlySales: plan.maxMonthlySales,
        features: planFeaturesJson(plan.features),
      },
    });
  }
  console.log(`✔ ${DEFAULT_PLANS.length} خطة اشتراك`);

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { category: permission.category, description: permission.description },
      create: permission,
    });
  }
  console.log(`✔ ${PERMISSIONS.length} صلاحية`);

  for (const roleDef of SYSTEM_ROLES) {
    // Partial unique index (roles_system_name_key) covers company_id IS NULL
    // uniqueness, but Prisma's typed upsert needs a declared @@unique to
    // target - find-then-write instead, safe since seeding isn't concurrent.
    let role = await prisma.role.findFirst({ where: { companyId: null, name: roleDef.name } });
    if (!role) {
      role = await prisma.role.create({
        data: { companyId: null, name: roleDef.name, isSystem: true },
      });
    }

    const permissionRows = await prisma.permission.findMany({
      where: { key: { in: roleDef.permissions } },
    });

    for (const permission of permissionRows) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }

    console.log(`✔ دور ${roleDef.name} (${permissionRows.length} صلاحية)`);
  }

  // Milestone 9: catalog row reserved since Phase 1 for exactly this
  // (schema.prisma "IntegrationProvider.key ... e.g. 'qeedha' - registered
  // later"). category:"erp" matches docs/QEEDHA_INTEGRATION.md's framing
  // (customer/amount verification, not a payment gateway).
  await prisma.integrationProvider.upsert({
    where: { key: QEEDHA_PROVIDER_KEY },
    update: { name: QEEDHA_PROVIDER_NAME, category: 'erp', isEnabledGlobally: true },
    create: {
      key: QEEDHA_PROVIDER_KEY,
      name: QEEDHA_PROVIDER_NAME,
      category: 'erp',
      isEnabledGlobally: true,
    },
  });
  console.log(`✔ مزوّد التكامل ${QEEDHA_PROVIDER_NAME}`);

  // Phase 11: a SEPARATE catalog row for the outbound direction (Qeedha B
  // calling out to Qeedha as a payment method), distinct from the inbound
  // row above - see providers/qeedha-payment-provider.ts for why the two
  // must not share a providerKey/IntegrationConnection row.
  await prisma.integrationProvider.upsert({
    where: { key: QEEDHA_PAYMENTS_PROVIDER_KEY },
    update: { name: 'قيّدها (دفع)', category: 'payment', isEnabledGlobally: true },
    create: {
      key: QEEDHA_PAYMENTS_PROVIDER_KEY,
      name: 'قيّدها (دفع)',
      category: 'payment',
      isEnabledGlobally: true,
    },
  });
  console.log('✔ مزوّد التكامل قيّدها (دفع)');

  // The ONE global system identity every company's Qeedha connection shares
  // as its actor (see qeedha-connection.service.ts ensureSystemMembership) -
  // status: disabled blocks login outright; the random password is never
  // retained/usable by design (nobody is ever meant to authenticate as this
  // User - it exists purely as an audit/RBAC actor for integration-triggered
  // business calls).
  const existingSystemUser = await prisma.user.findUnique({
    where: { email: INTEGRATION_SYSTEM_USER_EMAIL },
  });
  if (!existingSystemUser) {
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
    await prisma.user.create({
      data: {
        fullName: INTEGRATION_SYSTEM_USER_FULL_NAME,
        email: INTEGRATION_SYSTEM_USER_EMAIL,
        passwordHash,
        status: 'disabled',
        locale: 'ar',
      },
    });
    console.log('✔ هوية نظام تكامل قيّدها');
  } else {
    console.log('✔ هوية نظام تكامل قيّدها (موجودة بالفعل)');
  }

  // SaaS admin control panel: platform admins are never self-registered
  // (unlike merchant Owners via /auth/register-company) - this is the only
  // way one gets created, and only when both env vars are explicitly set.
  // Idempotent: re-running the seed never resets an existing admin's
  // password, matching how every other seed step here behaves.
  const platformAdminEmail = process.env.PLATFORM_ADMIN_SEED_EMAIL;
  const platformAdminPassword = process.env.PLATFORM_ADMIN_SEED_PASSWORD;
  if (platformAdminEmail && platformAdminPassword) {
    const existingAdmin = await prisma.platformAdmin.findUnique({
      where: { email: platformAdminEmail },
    });
    if (!existingAdmin) {
      const passwordHash = await argon2.hash(platformAdminPassword);
      await prisma.platformAdmin.create({
        data: { fullName: 'مدير المنصة', email: platformAdminEmail, passwordHash },
      });
      console.log(`✔ مدير منصة (${platformAdminEmail})`);
    } else {
      console.log(`✔ مدير منصة (${platformAdminEmail}) (موجود بالفعل)`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
