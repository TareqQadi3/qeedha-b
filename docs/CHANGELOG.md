# سجل التغييرات (Changelog)

## [Phase 2.1] - 2026-08-15

تعزيز أمني ضيق: إغلاق فجوة نطاق الفروع/المستودعات التي وثَّقتها المرحلة 2
صراحة كـ"جزئي وموثَّق" — وليست مرحلة منتج جديدة (لا POS/Sales/Accounting).

### أُضيف
- `BranchScopeService` (وحدة `iam`): يحسب نطاق الفروع المصرَّح بها لعضوية
  معيّنة، لصلاحية معيّنة، عبر `MembershipRole.branchId` الموجود أصلًا.
- إنفاذ `Permission + Scope` في كل عمليات المستودع المحدد بوحدة `inventory`
  (رصيد افتتاحي، تسوية، تحويل، جرد) — رفض 403 لخرق نطاق الفرع، متمايز عن 404
  لعدم الانتماء للمنشأة.
- 5 اختبارات e2e جديدة (قسم "نطاق الفروع/المستودعات" في
  `test/phase2.e2e-spec.ts`) — المجموع 38/38 بلا تراجع عن اختبارات المرحلة 2.

### قرارات معمارية مسجَّلة
- الفحص في طبقة الخدمة (Service)، وليس في `PermissionsGuard` — راجع
  `docs/PROJECT_STATUS.md` قسم "Architectural Decisions" للتفصيل الكامل.
- قوائم القراءة تُصفَّى بصمت (200 فارغ)، لا تُرفض (403) — يحافظ على اتفاقية
  عزل المستأجرين الصامتة الموجودة أصلًا في كل قوائم النظام.
- لا استخدام لـRLS لفرض نطاق الفرع — RLS يبقى مخصصًا حصرًا لعزل المستأجرين.
- لا أدوار جديدة (`BranchManager`/`WarehouseManager`) — نفس RBAC الحالي.
- Products/Customers/Suppliers تبقى tenant-wide بلا أي قيد فرع.

## [Phase 2] - 2026-08-15

Products + Inventory + Customers + Suppliers، كوحدات SaaS كاملة (tenant-scoped
+ RLS + RBAC + Audit من اليوم الأول)، مع واجهة أمامية حقيقية متصلة.

### أُضيف
- Prisma schema: `units, product_categories, brands, products,
  product_barcodes, stock_levels, stock_movements, stock_adjustments,
  stock_counts, stock_count_lines, customers, suppliers` — كل جدول بـRLS
  (`FORCE ROW LEVEL SECURITY` + policy `tenant_isolation`) مستقل.
- 16 صلاحية RBAC جديدة (`products.*`, `inventory.*`, `customers.*`,
  `suppliers.*`) وتحديث الأدوار الافتراضية الخمسة لتشملها بشكل مناسب لكل دور.
- وحدة `catalog`: Products + Categories (شجرية) + Brands + Units، مع تحقق
  صريح من ملكية المراجع عبر المنشآت (category/brand/unit) وSKU/باركود فريدين
  لكل منشأة، وأحداث Audit منفصلة لتغيّر السعر وتغيّر SKU.
- وحدة `inventory`: `InventoryService.recordMovement` كمسار الكتابة الوحيد
  لرصيد المخزون، بنمط ذرّي (`INSERT ... ON CONFLICT DO NOTHING` + `UPDATE`
  محروس يمنع الأرصدة السالبة) مُختبَر بـ10 طلبات متزامنة حقيقية؛ رصيد
  افتتاحي، تسوية، تحويل فوري بين مستودعين، ودورة جرد مخزون كاملة
  (draft → تحديث سطور → اعتماد ينتج حركات تسوية تلقائيًا → تجميد).
- وحدة `parties`: Customers/Suppliers ككيانين منفصلين عمدًا، مرجع
  (`reference`) فريد اختياري لكل منشأة، بلا حقول Qeedha مُخترَعة.
- واجهة أمامية جديدة (`/frontend`, React + Vite + TypeScript + Tailwind RTL):
  تسجيل دخول/تسجيل منشأة (بما فيه اختيار المنشأة متعدد العضويات)، لوحة تحكم
  بمؤشرات من بيانات حقيقية، شاشات المنتجات/الكتالوج/المخزون/العملاء/الموردين
  متصلة فعليًا بالـAPI — لا بيانات وهمية. اختُبرت يدويًا عبر Playwright بتشغيل
  فعلي للـbackend/frontend معًا (9 سيناريوهات مستخدم حقيقية).
- `test/phase2.e2e-spec.ts`: 33 اختبارًا (وظيفية + أمنية عبر-المنشآت) — راجع
  `docs/TESTING.md`.

### قرارات معمارية مسجَّلة
- سلامة المراجع عبر المنشآت (category/brand/unit/warehouse) تُفرض في طبقة
  التطبيق صراحة، لأن FK وحده لا يعبّر عن "نفس الصف وفي نفس المنشأة".
- التحويل بين المستودعين مُنفَّذ كخطوة واحدة فورية فقط؛ التحويل متعدد المراحل
  (طلب → شحن → استلام) مؤجَّل لمرحلة لاحقة.
- **نطاق الفروع/المستودعات في تفويض الصلاحيات لم يُفعَّل بعد**:
  `MembershipRole.branchId` موجود في المخطط لكن `PermissionsGuard` لا يقرأه
  في هذه المرحلة — موثَّق صراحة في `docs/DOMAIN_MODEL.md` و`docs/SECURITY.md`
  كسلوك حالي معروف، وليس ثغرة مسكوت عنها.
- لا حقول ائتمان/رصيد للعملاء/الموردين بعد (تنتمي لمرحلة المحاسبة).

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
