# الأمان (Security)

## المصادقة (Authentication)
- كلمات المرور: Argon2id (لا MD5/SHA عاري).
- JWT access token قصير الأجل (15 دقيقة افتراضيًا)، يحمل `sub` (userId) و
  `companyId` و`membershipId` معًا — راجع `DOMAIN_MODEL.md` "Current Tenant
  Context".
- refresh token طويل الأجل (مثلًا 30 يومًا) **مع تدوير (rotation)**: كل
  استخدام لـrefresh يُصدر واحدًا جديدًا ويُبطل القديم؛ استخدام رمز مُبطَل
  سابقًا يُبطل السلسلة كاملة (إشارة سرقة محتملة). كل refresh token مرتبط
  بـ`membership_id` محدد (الجلسة مقصورة على tenant واحد مُختار مسبقًا).
- `refresh_tokens` يُخزَّن كـhash فقط، وليس القيمة الخام.
- **Tenant Selection Token**: رمز JWT منفصل تمامًا (سرّ توقيع مختلف عن
  الوصول العادي: `JWT_TENANT_SELECTION_SECRET`) يُصدر فقط بين التحقق من
  كلمة المرور واختيار المنشأة لمستخدم لديه أكثر من Membership. عمر قصير
  جدًا (10 دقائق افتراضيًا)، ويحمل `purpose: "tenant_selection"` يُتحقق منه
  صراحة عند الاستخدام حتى لا يُقبل بالخطأ كـaccess token في أي Guard.
- Rate limiting على `/auth/login`, `/auth/register-company`, `/auth/refresh`,
  `/auth/select-tenant`.

## التفويض (Authorization)
- RBAC بثلاث طبقات (Role/Permission/Scope) — راجع `ARCHITECTURE.md` §6،
  **مُسنَدة إلى Membership وليس إلى User مباشرة** (`DOMAIN_MODEL.md`).
- فرض ثلاثي الطبقات: `JwtAuthGuard` (مصادقة) → `MembershipGuard` (العضوية
  الحالية `active` فعليًا، على كل طلب مُصادَق عليه) → `PermissionsGuard`
  (الصلاحية المطلوبة عبر `membershipId`).
- لا Endpoint بدون `@RequirePermissions(...)` صريح إلا ما هو معلن Public عمدًا
  (health check، تسجيل الدخول، اختيار المنشأة، تسجيل منشأة جديدة، webhook
  موقّع).

## عزل المستأجرين (Tenant Isolation)
- كل استعلام يمر عبر `PrismaService.withTenant(companyId, ...)` يحقن
  `company_id` عبر `SET LOCAL app.tenant_id` داخل معاملة، وPostgres RLS
  (FORCE) يفرضه بشكل مستقل عن كود التطبيق كخط دفاع ثانٍ.
- **لا مسار API يقبل `companyId` من العميل لتحديد نطاق البيانات — يُشتق من
  الجلسة (JWT) فقط.** حتى Endpoints تبديل المنشأة (`select-tenant`,
  `switch-tenant`) التي تستقبل `companyId` في الطلب **لا تثق به مباشرة** —
  تتحقق دائمًا من وجود `Membership` نشطة فعلية لذلك الـ`(userId, companyId)`
  قبل إصدار أي token جديد (`AuthService.completeTenantLogin`، مُختبَر صراحة
  في `test/app.e2e-spec.ts`: محاولة `switch-tenant` لمنشأة بلا عضوية تُرفض
  بـ403 دائمًا).
- `users` نفسها **ليست** بيانات tenant (لا `company_id`، لا RLS) — هوية
  الشخص عالمية؛ ما هو tenant-scoped ومحمي بـRLS هو `memberships` و
  `membership_roles` فقط من بين جداول الهوية.

## Auth bootstrap (دور DB منفصل وضيق: `qeedha_auth_lookup`)
حل مشكلة "من هو المستخدم، وما المنشآت التي يملك عضوية فيها؟" **قبل** وجود
tenant context لتفعيل RLS العادي:
- **التحقق من بيانات الدخول** (`users`): لم يعد يحتاج دورًا خاصًا إطلاقًا —
  `users` غير محمي بـRLS أصلًا بعد إعادة الهيكلة، فالاستعلام يمر عبر الدور
  العادي للتطبيق مباشرة.
- **تحديد المنشآت المتاحة** (`memberships` + `companies`): هذان الجدولان
  محميان بـRLS (tenant-owned)، فلا يمكن قراءتهما بلا tenant context معروف
  مسبقًا. دور `qeedha_auth_lookup` (`BYPASSRLS`، صلاحية `SELECT` محدودة على
  أعمدة معيّنة فقط من `memberships`/`companies`، لا صلاحية كتابة إطلاقًا)
  يُستخدم حصرًا لهذه الخطوة، عبر `AuthLookupService` وحده. لا تُمنح هذه
  الصلاحية للدور الرئيسي للتطبيق أبدًا — هذا يُبطل RLS كخط دفاع لكل شيء آخر.
- الإعداد: `prisma/manual-sql/001_auth_lookup_role.sql` ثم
  `002_auth_lookup_role_update.sql` (الأخير يُزيل الصلاحية القديمة على
  `users` بعد أن أصبحت غير ضرورية، ويضيف الصلاحية الجديدة على
  `memberships`/`companies`).

## حماية أسرار التكامل
- بيانات اعتماد أي `integration_connection` (رموز API، مفاتيح) تُشفَّر عند
  التخزين (encryption at rest) بمفتاح مُدار خارج قاعدة البيانات (متغير بيئة/
  Secret manager) — لا تُخزَّن نصًا صريحًا أبدًا.
- لا تُطبع أسرار التكامل أو التوكنات كاملة في الـLogs.

## نطاق الفروع/المستودعات — الوضع الحالي بصراحة (المرحلة 2)

> راجع `DOMAIN_MODEL.md` القسم المخصص لهذا الموضوع للتفاصيل الكاملة. الملخص
> الأمني هنا: **`PermissionsGuard` في المرحلة 2 لا يفرض أي نطاق فرع/مستودع.**
> عضو يملك `inventory.adjust` يستطيع التأثير على أي مستودع تابع لمنشأته، بصرف
> النظر عن `MembershipRole.branchId` الخاص به. الفصل المفروض فعليًا هو فصل
> **بين المنشآت** (tenant isolation عبر RLS)، وليس فصلًا بين فروع **داخل**
> نفس المنشأة. هذا قرار موثَّق صراحة وليس ثغرة مسكوت عنها — التوسّع
> المستقبلي (تفعيل فحص `branchId` في `PermissionsGuard`) مخطَّط له ولم يُبنَ
> بعد.

## سلامة المراجع عبر المنشآت (Cross-Tenant Reference Integrity) — المرحلة 2

FK عادي في Postgres لا يمنع ربط صف بصف من منشأة أخرى طالما الـID صحيح شكليًا
(FK يتحقق فقط من وجود الصف، لا من `company_id` المطابق). لذلك كل ربط بين
كيانات في المرحلة 2 (منتج↔تصنيف/علامة/وحدة، حركة مخزون↔مستودع) يمر عبر تحقق
صريح في طبقة الخدمة (`assertReferencesOwnedByTenant`, `assertWarehouseOwned`,
`assertProductOwned`) يرفض الطلب (`404`/`400`) إن كان المرجع المُرسَل يعود
لمنشأة مختلفة عن `companyId` الحالي — قبل أي كتابة في قاعدة البيانات. مُختبَر
صراحة في `test/phase2.e2e-spec.ts` (محاولات ربط منتج بتصنيف/علامة/وحدة من
منشأة أخرى، ومحاولات تحويل/تسوية مخزون على مستودع من منشأة أخرى).

## سلامة التزامن (Concurrency Safety) — المرحلة 2

كتابة رصيد المخزون (`InventoryService.recordMovement`) هي المسار الوحيد
المسموح لتعديل `stock_levels.quantity_on_hand` في الكود بأكمله. Prisma
`upsert()` **غير ذرّي فعليًا** على Postgres تحت تزامن حقيقي (يُترجَم إلى
معاملة SELECT-ثم-INSERT/UPDATE، وليس `ON CONFLICT` أصيلًا) — لذلك يُستخدم:

1. `INSERT ... ON CONFLICT (company_id, warehouse_id, product_id) DO NOTHING`
   (SQL خام، ذرّي فعليًا على مستوى Postgres) لضمان وجود صف `stock_levels`.
2. `UPDATE stock_levels SET quantity_on_hand = quantity_on_hand + $delta
   WHERE ... AND quantity_on_hand + $delta >= 0 RETURNING ...` — تحديث ذرّي
   واحد يمنع كلًا من الكميات السالبة (شرط `>= 0` داخل نفس عبارة الـUPDATE،
   لا فحص منفصل قبله يفتح نافذة سباق) **و**فقدان التحديثات المتزامنة (لا حاجة
   لقفل صفوف صريح — الذرّية من عبارة الـSQL نفسها).

مُختبَر تجريبيًا (وليس نظريًا فقط) عبر اختبار e2e يرسل 10 طلبات HTTP متزامنة
حقيقية لنفس `(warehouse, product)` ويتحقق أن الرصيد النهائي == 10 بالضبط وأن
عدد صفوف `stock_movements` الناتجة == 10 بالضبط (`test/phase2.e2e-spec.ts`).

## Audit Log
راجع `ARCHITECTURE.md` §7 و`DATABASE.md` §1. يُسجَّل: من نفّذ، متى، أي فرع،
القيمة قبل/بعد عند الحاجة. لا Audit log قابل للتعديل أو الحذف من واجهة
التطبيق.

## بيانات حساسة أخرى
- لا تُسجَّل أرقام بطاقات كاملة، هويات وطنية، أو توكنات دفع في أي Log.
- تصدير التقارير المالية/الجماعي (bulk export) يتطلب صلاحية خاصة ويُسجَّل في
  Audit log.

## Rate Limiting عام
يُطبَّق على مستوى API Gateway/Middleware لكل الـEndpoints العامة، وبحدود أشد
على المسارات الحساسة (auth, webhooks, bulk export).

## هذا الملف حي
يُحدَّث مع كل مرحلة تُضيف سطح هجوم جديد (مثلًا: مرحلة ZATCA تضيف اعتبارات
تواقيع رقمية ومفاتيح تشفير خاصة بالهيئة، مرحلة Integration تضيف اعتبارات
Webhook signature verification لكل مزوّد).
