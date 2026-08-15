# سجل التغييرات (Changelog)

## [Phase 1] - 2026-08-15

### أُضيف
- إنشاء بنية المستودع (`/docs`, `/backend`).
- توثيق كامل: PROJECT_OVERVIEW, ARCHITECTURE, DATABASE, MODULES, API, POS,
  ACCOUNTING, INVENTORY, IMPORT_EXCEL, ZATCA, QEEDHA_INTEGRATION, SECURITY,
  TESTING, ROADMAP, PROJECT_STATUS.
- Backend: NestJS + Prisma + PostgreSQL scaffold.
- Prisma schema للمرحلة الأولى: `companies, branches, warehouses,
  pos_devices, users, roles, permissions, role_permissions, user_roles,
  refresh_tokens, audit_logs, integration_providers, integration_connections,
  webhook_events`.
- وحدة `auth`: تسجيل منشأة جديدة، تسجيل دخول، refresh token بتدوير، logout.
- وحدة `iam`: Roles/Permissions/UserRoles + Guards للتفويض.
- وحدة `tenancy`: Company/Branch/Warehouse/PosDevice CRUD أساسي.
- وحدة `audit`: Audit log service + interceptor.
- وحدة `integrations` (core فقط): Ports عامة، IntegrationConnection CRUD،
  Webhook inbox عام — بدون أي منطق خاص بقيّدها.
- Multi-tenancy: Prisma middleware للتلقيم التلقائي + Postgres RLS policies.
- اختبارات e2e أساسية لتدفقات auth/RBAC/tenant isolation.

### قرارات معمارية مسجَّلة
- Shared-schema multi-tenancy مع RLS كخط دفاع ثانٍ (وليس schema-per-tenant).
- Customers/Suppliers ككيانين منفصلين (وليس Party موحّد).
- عمود `payments.method` (مرحلة لاحقة) لا يتضمن enum ثابت لقيّدها — القيم من
  تكامل خارجي تُشتق من `integration_connections` النشطة.
