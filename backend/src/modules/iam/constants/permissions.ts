export interface PermissionDefinition {
  key: string;
  category: string;
  description: string;
}

/**
 * Single source of truth for permission keys, shared by app code
 * (@RequirePermissions guards) and prisma/seed.ts. New permissions from
 * later phases (sales.*, inventory.*, accounting.* ...) get appended here,
 * never as a hardcoded enum requiring a migration to extend.
 */
export const PERMISSIONS: PermissionDefinition[] = [
  { key: 'iam.roles.view', category: 'iam', description: 'عرض الأدوار والصلاحيات المتاحة' },
  { key: 'iam.users.view', category: 'iam', description: 'عرض مستخدمي المنشأة' },
  {
    key: 'iam.users.manage',
    category: 'iam',
    description: 'إضافة مستخدمين وإسناد/إلغاء أدوار',
  },
  { key: 'tenancy.branches.view', category: 'tenancy', description: 'عرض الفروع' },
  { key: 'tenancy.branches.manage', category: 'tenancy', description: 'إدارة الفروع' },
  { key: 'tenancy.warehouses.view', category: 'tenancy', description: 'عرض المستودعات' },
  { key: 'tenancy.warehouses.manage', category: 'tenancy', description: 'إدارة المستودعات' },
  {
    key: 'tenancy.pos_devices.view',
    category: 'tenancy',
    description: 'عرض أجهزة نقاط البيع',
  },
  {
    key: 'tenancy.pos_devices.manage',
    category: 'tenancy',
    description: 'إدارة أجهزة نقاط البيع',
  },
  {
    key: 'settings.integrations.view',
    category: 'integrations',
    description: 'عرض إعدادات التكاملات',
  },
  {
    key: 'settings.integrations.manage',
    category: 'integrations',
    description: 'ربط/فصل التكاملات',
  },
  { key: 'audit.view', category: 'audit', description: 'عرض سجل العمليات (Audit Log)' },
];

export const PERMISSION_KEYS = {
  IAM_ROLES_VIEW: 'iam.roles.view',
  IAM_USERS_VIEW: 'iam.users.view',
  IAM_USERS_MANAGE: 'iam.users.manage',
  TENANCY_BRANCHES_VIEW: 'tenancy.branches.view',
  TENANCY_BRANCHES_MANAGE: 'tenancy.branches.manage',
  TENANCY_WAREHOUSES_VIEW: 'tenancy.warehouses.view',
  TENANCY_WAREHOUSES_MANAGE: 'tenancy.warehouses.manage',
  TENANCY_POS_DEVICES_VIEW: 'tenancy.pos_devices.view',
  TENANCY_POS_DEVICES_MANAGE: 'tenancy.pos_devices.manage',
  SETTINGS_INTEGRATIONS_VIEW: 'settings.integrations.view',
  SETTINGS_INTEGRATIONS_MANAGE: 'settings.integrations.manage',
  AUDIT_VIEW: 'audit.view',
} as const;

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
