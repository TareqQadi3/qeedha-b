# سجل التغييرات (Changelog)

## [Auth/IAM Identity Refactor] - 2026-08-15

قبل بدء المرحلة 2، بناءً على طلب صريح: Qeedha Accounting منتج SaaS متعدد
المستأجرين من اليوم الأول، والمستخدم قد ينتمي لأكثر من منشأة.

### أُضيف
- `docs/DOMAIN_MODEL.md` (جديد): توثيق كامل لنموذج
  User/Tenant/Membership/Role/Permission/Branch Scope/Current Tenant Context.
- جدول `memberships`: العلاقة الوحيدة بين User وCompany (tenant-scoped، RLS).
- جدول `membership_roles` (يحل محل `user_roles`): الدور يُسنَد للعضوية
  (Membership) لا للمستخدم عالميًا — نفس الشخص قد يحمل دورًا مختلفًا تمامًا
  في كل منشأة.
- `POST /auth/select-tenant`: إتمام الدخول لمستخدم بعدة عضويات، عبر
  tenantSelectionToken قصير الأجل بسرّ توقيع منفصل.
- `POST /auth/switch-tenant` + `GET /auth/tenants`: أساس Tenant Switcher.
- `MembershipGuard`: يتحقق أن العضوية الحالية `active` فعليًا على كل طلب
  مُصادَق عليه، حتى بلا فحص صلاحية محدد.
- `IamService.createUser` أصبح يُرفق مستخدمًا عالميًا موجودًا بمنشأة جديدة
  (بدون لمس كلمة مروره) إن تطابق البريد/الجوال، بدل افتراض أنه دائمًا جديد.
- Migration بيانات آمن (`20260815120000_membership_identity_model`) يُبقي
  كل البيانات الموجودة: كل مستخدم سابق (كان له `company_id` واحد) أصبح له
  Membership واحدة مطابقة تمامًا، بلا فقدان بيانات.
- 6 اختبارات e2e جديدة لسيناريوهات تعدد المنشآت (16/16 تنجح إجمالًا).

### أُزيل
- `users.company_id` (المستخدم لم يعد مملوكًا لمنشأة واحدة، ولا يخضع لـRLS
  إطلاقًا بعد الآن).
- جدول `user_roles` (استُبدل بـ`membership_roles`).

### قرارات معمارية مسجَّلة
- `email`/`mobile` يبقيان فريدين عالميًا (كما في المرحلة 1)، لكن الآن لسبب
  إضافي: حل هوية المستخدم قبل معرفة أي Membership سيُختار.
- دور DB `qeedha_auth_lookup` انتقل من حماية `users` إلى حماية
  `memberships`/`companies` (التفاصيل في `docs/SECURITY.md`).
- Tenant Selection Token بسرّ توقيع مستقل تمامًا عن access token، لمنع أي
  خلط مستقبلي بين الاثنين في أي Guard.

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
