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

  // Phase 2: Catalog (products/categories/brands/units)
  {
    key: 'products.read',
    category: 'products',
    description: 'عرض المنتجات والتصنيفات والعلامات والوحدات',
  },
  {
    key: 'products.create',
    category: 'products',
    description: 'إضافة منتجات/تصنيفات/علامات/وحدات',
  },
  {
    key: 'products.update',
    category: 'products',
    description: 'تعديل منتجات/تصنيفات/علامات/وحدات',
  },
  {
    key: 'products.delete',
    category: 'products',
    description: 'حذف/تعطيل منتجات/تصنيفات/علامات/وحدات',
  },

  // Phase 2: Inventory
  { key: 'inventory.read', category: 'inventory', description: 'عرض أرصدة المخزون وسجل الحركات' },
  { key: 'inventory.adjust', category: 'inventory', description: 'إجراء تسويات مخزون' },
  { key: 'inventory.count', category: 'inventory', description: 'إجراء وإتمام الجرد' },
  { key: 'inventory.transfer', category: 'inventory', description: 'تحويل مخزون بين المستودعات' },

  // Phase 2: Customers
  { key: 'customers.read', category: 'customers', description: 'عرض العملاء' },
  { key: 'customers.create', category: 'customers', description: 'إضافة عملاء' },
  { key: 'customers.update', category: 'customers', description: 'تعديل بيانات عملاء' },
  { key: 'customers.delete', category: 'customers', description: 'حذف/تعطيل عملاء' },

  // Phase 2: Suppliers
  { key: 'suppliers.read', category: 'suppliers', description: 'عرض الموردين' },
  { key: 'suppliers.create', category: 'suppliers', description: 'إضافة موردين' },
  { key: 'suppliers.update', category: 'suppliers', description: 'تعديل بيانات موردين' },
  { key: 'suppliers.delete', category: 'suppliers', description: 'حذف/تعطيل موردين' },

  // Phase 3: Sales (POS)
  { key: 'sales.read', category: 'sales', description: 'عرض المبيعات والفواتير' },
  { key: 'sales.create', category: 'sales', description: 'إتمام عملية بيع (POS)' },
  {
    key: 'sales.cancel',
    category: 'sales',
    description: 'إلغاء عملية بيع مكتملة (يُرجع المخزون)',
  },

  // Phase 3: Invoices
  { key: 'invoices.read', category: 'invoices', description: 'عرض الفواتير' },
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
  PRODUCTS_READ: 'products.read',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DELETE: 'products.delete',
  INVENTORY_READ: 'inventory.read',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_COUNT: 'inventory.count',
  INVENTORY_TRANSFER: 'inventory.transfer',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_UPDATE: 'customers.update',
  CUSTOMERS_DELETE: 'customers.delete',
  SUPPLIERS_READ: 'suppliers.read',
  SUPPLIERS_CREATE: 'suppliers.create',
  SUPPLIERS_UPDATE: 'suppliers.update',
  SUPPLIERS_DELETE: 'suppliers.delete',
  SALES_READ: 'sales.read',
  SALES_CREATE: 'sales.create',
  SALES_CANCEL: 'sales.cancel',
  INVOICES_READ: 'invoices.read',
} as const;

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
