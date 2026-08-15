import { ALL_PERMISSION_KEYS, PERMISSION_KEYS } from './permissions';

export interface SystemRoleDefinition {
  name: string;
  description: string;
  permissions: string[];
}

/**
 * System roles (company_id = NULL) seeded once, shared by every tenant.
 * Accountant still carries a minimal permission set as of Phase 3 - its full
 * set (accounting.*) doesn't exist until Phase 4. Seeding roles now (even
 * sparse) means role assignment and RBAC UI can be built and tested without
 * waiting for every future phase's permissions to exist.
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
      PERMISSION_KEYS.PRODUCTS_READ,
      PERMISSION_KEYS.PRODUCTS_CREATE,
      PERMISSION_KEYS.PRODUCTS_UPDATE,
      PERMISSION_KEYS.PRODUCTS_DELETE,
      PERMISSION_KEYS.INVENTORY_READ,
      PERMISSION_KEYS.INVENTORY_ADJUST,
      PERMISSION_KEYS.INVENTORY_COUNT,
      PERMISSION_KEYS.INVENTORY_TRANSFER,
      PERMISSION_KEYS.CUSTOMERS_READ,
      PERMISSION_KEYS.CUSTOMERS_CREATE,
      PERMISSION_KEYS.CUSTOMERS_UPDATE,
      PERMISSION_KEYS.CUSTOMERS_DELETE,
      PERMISSION_KEYS.SUPPLIERS_READ,
      PERMISSION_KEYS.SUPPLIERS_CREATE,
      PERMISSION_KEYS.SUPPLIERS_UPDATE,
      PERMISSION_KEYS.SUPPLIERS_DELETE,
      PERMISSION_KEYS.SALES_READ,
      PERMISSION_KEYS.SALES_CREATE,
      PERMISSION_KEYS.SALES_CANCEL,
      PERMISSION_KEYS.INVOICES_READ,
    ],
  },
  {
    name: 'Cashier',
    description: 'كاشير - يشغّل نقطة البيع؛ لا يملك إلغاء بيع مكتمل (صلاحية مشرف)',
    permissions: [
      PERMISSION_KEYS.PRODUCTS_READ,
      PERMISSION_KEYS.CUSTOMERS_READ,
      PERMISSION_KEYS.SALES_READ,
      PERMISSION_KEYS.SALES_CREATE,
      PERMISSION_KEYS.INVOICES_READ,
    ],
  },
  {
    name: 'Accountant',
    description:
      'محاسب - صلاحيات المحاسبة الكاملة تُضاف في المرحلة 4، يحتاج الآن رؤية العملاء/الموردين/المنتجات/المبيعات/الفواتير للتقارير',
    permissions: [
      PERMISSION_KEYS.AUDIT_VIEW,
      PERMISSION_KEYS.PRODUCTS_READ,
      PERMISSION_KEYS.INVENTORY_READ,
      PERMISSION_KEYS.CUSTOMERS_READ,
      PERMISSION_KEYS.SUPPLIERS_READ,
      PERMISSION_KEYS.SALES_READ,
      PERMISSION_KEYS.INVOICES_READ,
    ],
  },
  {
    name: 'Inventory Manager',
    description: 'مسؤول المخزون - صلاحيات المخزون والمنتجات الكاملة',
    permissions: [
      PERMISSION_KEYS.TENANCY_WAREHOUSES_VIEW,
      PERMISSION_KEYS.PRODUCTS_READ,
      PERMISSION_KEYS.PRODUCTS_CREATE,
      PERMISSION_KEYS.PRODUCTS_UPDATE,
      PERMISSION_KEYS.INVENTORY_READ,
      PERMISSION_KEYS.INVENTORY_ADJUST,
      PERMISSION_KEYS.INVENTORY_COUNT,
      PERMISSION_KEYS.INVENTORY_TRANSFER,
      PERMISSION_KEYS.SUPPLIERS_READ,
    ],
  },
];
