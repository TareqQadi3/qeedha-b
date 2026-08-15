import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../src/modules/iam/constants/permissions';
import { SYSTEM_ROLES } from '../src/modules/iam/constants/default-roles';

const prisma = new PrismaClient();

async function main() {
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
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
