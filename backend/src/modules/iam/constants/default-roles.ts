import { ALL_PERMISSION_KEYS, PERMISSION_KEYS } from './permissions';

export interface SystemRoleDefinition {
  name: string;
  description: string;
  permissions: string[];
}

/**
 * System roles (company_id = NULL) seeded once, shared by every tenant.
 * Cashier/Accountant/Inventory Manager carry no permissions yet because
 * their real permission set (sales.*, accounting.*, inventory.*) doesn't
 * exist until phases 2-4 - seeding them now (empty) means role assignment
 * and RBAC UI can be built and tested in Phase 1 without waiting.
 */
export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    name: 'Owner',
    description: 'صاحب المنشأة - كل الصلاحيات',
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    name: 'Manager',
    description: 'مدير فرع - إدارة تشغيلية دون التحكم بالتكاملات أو صلاحيات المستخدمين',
    permissions: [
      PERMISSION_KEYS.IAM_ROLES_VIEW,
      PERMISSION_KEYS.IAM_USERS_VIEW,
      PERMISSION_KEYS.TENANCY_BRANCHES_VIEW,
      PERMISSION_KEYS.TENANCY_WAREHOUSES_VIEW,
      PERMISSION_KEYS.TENANCY_WAREHOUSES_MANAGE,
      PERMISSION_KEYS.TENANCY_POS_DEVICES_VIEW,
      PERMISSION_KEYS.TENANCY_POS_DEVICES_MANAGE,
    ],
  },
  {
    name: 'Cashier',
    description: 'كاشير - صلاحيات نقطة البيع تُضاف في المرحلة 3',
    permissions: [],
  },
  {
    name: 'Accountant',
    description: 'محاسب - صلاحيات المحاسبة والتقارير تُضاف في المرحلة 4',
    permissions: [PERMISSION_KEYS.AUDIT_VIEW],
  },
  {
    name: 'Inventory Manager',
    description: 'مسؤول المخزون - صلاحيات المخزون التفصيلية تُضاف في المرحلة 2',
    permissions: [PERMISSION_KEYS.TENANCY_WAREHOUSES_VIEW],
  },
];
