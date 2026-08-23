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
- **Phase 12**: نفس مشكلة "bootstrap" بالضبط، لثلاث حاجات جديدة لا تعرف
  الـtenant بعد: تحديد `Company` من `subscriptionNumber` (owner login + نقطة
  دخول employee-login)، سرد فروع تلك الشركة (قائمة الفرع المنسدلة)، وتحديد
  Membership صاحب الدور النظامي `Owner` لحل owner login عبر رقم الاشتراك.
  توسيع إضافي لنفس الدور الضيق (`qeedha_auth_lookup`) على أعمدة محدَّدة من
  `companies.subscription_number`، `branches`، `membership_roles`، `roles` -
  `prisma/manual-sql/007_auth_lookup_role_phase12.sql`. لا صلاحية كتابة، ولا
  توسيع لأي دور آخر.

## تعداد رقم الاشتراك (subscriptionNumber enumeration) — Phase 12

`subscriptionNumber` رقم تسلسلي بسيط (`SERIAL`، يبدأ من 10001) بلا أي
عشوائية - أي طرف غير مصادَق يقدر نظريًا يجرّب الأرقام تباعًا (10001، 10002،
...) عبر `GET /auth/companies/:subscriptionNumber/branches` (عام بالتصميم،
الموظف يحتاجه قبل إدخال بيانات دخوله). تم تضييق هذا صراحة بخطوتين معًا لا
كل منهما بمفرده:
1. **الاستجابة لا تتضمن اسم الشركة إطلاقًا** (فروع فقط) - محاولة تعداد
   الأرقام لا تُنتج قائمة أسماء شركات مقروءة، فقط أسماء فروع مجهولة الهوية
   بلا ربط بأي شركة معروفة.
2. **حد أشد للطلبات على هذا المسار تحديدًا**: 5/دقيقة لكل IP (بقية مسارات
   Auth العامة 10-20/دقيقة) - يرفع تكلفة أي محاولة مسح شامل للنطاق بشكل
   ملموس.
لا يزال بالإمكان، ببطء شديد، معرفة عدد فروع شركة بمعرفة رقمها مسبقًا -
هذا مقبول (رقم الاشتراك مصمَّم أصلًا ليُشارَك مع الموظفين، وليس سرًا)، لكن
حصاد "قائمة بكل الشركات المسجَّلة بالمنصة وأسمائها" - الخطر الفعلي - أُغلق.

## قرار Milestone 2: لماذا `refresh_tokens` لا يزال الاستثناء الوحيد من RLS

راجَعنا صراحة (لا تخمين) إمكانية إضافة RLS لـ`refresh_tokens` في هذه
المرحلة، وقررنا **الإبقاء على الاستثناء الموثَّق مسبقًا**، لسبب معماري
حقيقي وليس تكاسلًا:

**المشكلة**: كل عملية على `refresh_tokens` اليوم (`AuthService.issueTokens`
عند الإصدار، `AuthService.refresh` عند القراءة/التدوير، `AuthService.logout`
عند الإبطال) تُنفَّذ عبر `this.prisma.refreshToken.*` مباشرة — **خارج أي
معاملة `withTenant(...)`** — لأن `companyId` ليس معروفًا دائمًا قبل تنفيذ
الاستعلام:

- `POST /auth/refresh` يستقبل من العميل **رمز التحديث الخام فقط**، لا
  `companyId`. الخطوة الأولى داخل `AuthService.refresh` هي استعلام
  `tx.refreshToken.findUnique({ where: { tokenHash } })` **لاكتشاف** أي
  `companyId`/`membershipId`/`userId` يخص هذا الرمز. لو طُبِّق RLS إجباريًا
  (`FORCE ROW LEVEL SECURITY`) هنا، لتوجَّب معرفة `app.tenant_id` **قبل**
  تنفيذ الاستعلام الذي يكشفه أصلًا — تناقض دائري (نفس مشكلة "auth bootstrap"
  أعلاه بالضبط، لكن لعملية refresh لا login).

**الخيار الآمن الوحيد المتاح لحلّه** يطابق تمامًا النمط المستخدم فعليًا
لمشكلة login المطابقة: توسيع دور `qeedha_auth_lookup` (`BYPASSRLS`، ضيق
جدًا) ليشمل `SELECT`/`UPDATE` محدودين على `refresh_tokens` لخطوة
"العثور على الرمز بمعرفة الـhash فقط" حصرًا، ثم إعادة كل عملية أخرى
(الإصدار عند login/select-tenant/switch-tenant، الإبطال عند logout، تحديث
`revoked_at`/`replaced_by_token_id` بعد التدوير) عبر `withTenant(companyId, ...)`
الآن بعد معرفة الـcompanyId فعليًا.

**قرار عدم التنفيذ في Milestone 2 (موثَّق، وليس تخمينًا أو تكاسلًا)**:
- هذا تعديل مباشر على **أكثر مسار حسّاسًا في كامل النظام** (تسجيل
  الدخول/التحديث/الإبطال) — دمجه بأمان يحتاج إعادة كتابة `AuthService`
  الفعلية وتوسيع دور DB إضافي عبر ملف SQL يدوي ثالث (`003_...sql`)، وهو
  بالضبط نوع الخطوة اليدوية غير الآلية التي هذه المرحلة (Production
  Hardening) يجب أن تُقلِّلها لا تُضاعِفها.
- **الفجوة الأمنية الفعلية التي تسدّها RLS هنا محدودة جدًا اليوم**: كل
  استعلام حالي على `refresh_tokens` مُقيَّد إما بـ`tokenHash` (قيمة سرّية
  عشوائية 48 بايت، غير قابلة للتخمين، يملكها العميل الشرعي فقط) أو بـ
  `userId` مُستخرَج من JWT مُصادَق عليه بالفعل — **لا يوجد أي مسار كود اليوم
  يُعيد صفوف refresh_tokens عبر منشآت مختلفة لطلب مستخدم واحد**، وليس هناك
  Endpoint لعرض/سرد جلسات المستخدم بعد (`GET /auth/sessions` أو ما شابه لم
  يُبنَ). RLS هنا ستكون طبقة دفاع إضافي ضد **علّة مستقبلية محتملة** (مثل
  Endpoint سرد جلسات يُبنى لاحقًا بلا فلترة صحيحة)، وليست إغلاقًا لثغرة
  IDOR قابلة للاستغلال فعليًا اليوم.
- الأمان الفعلي لهذا الجدول اليوم يعتمد على: (1) الرمز نفسه هو السرّ (نفس
  مبدأ أي Session Token في أي نظام مصادقة تقريبًا — امتلاك الرمز هو التفويض
  بحد ذاته)، (2) `token_hash` فريد ومفهرَس، (3) كل استعلام مُقيَّد صراحة
  بـ`userId`/`tokenHash` في كود `AuthService` (مُراجَع بالكامل، بلا أي
  `findMany` غير مُقيَّد على هذا الجدول).

**القرار**: الاستثناء يبقى كما هو موثَّق في `prisma/schema.prisma` (تعليق
`RefreshToken` model) وأعلى هذا القسم. **مُرشَّح واضح لمرحلة مستقبلية** إن
أُضيفت ميزة "إدارة الجلسات النشطة" (`GET/DELETE /auth/sessions`) — عندها
تصبح إضافة RLS + توسيع `qeedha_auth_lookup` مبرَّرة عمليًا لا نظريًا فقط.

## CORS — سياسة مبنية على البيئة (Milestone 2)

قبل Milestone 2، كان `app.enableCors()` يُستدعى بلا أي خيارات في
`main.ts` — يعكس/يقبل أي origin طالب بلا قيد. الآن `buildCorsOptions`
(`src/config/cors.config.ts`) يبني قائمة origins مسموحة صراحة من متغيّر
بيئة `CORS_ALLOWED_ORIGINS` (مفصول بفواصل) — **لا `"*"` أبدًا في أي
بيئة**:

- **production**: `CORS_ALLOWED_ORIGINS` **إلزامي**.
  `assertCorsConfiguredForProduction` (تُستدعى في `main.ts` قبل أي شيء
  آخر عند الإقلاع) ترفض بدء التطبيق بالكامل إن كان غائبًا أو فارغًا —
  **Fail-closed**: خطأ إقلاع صريح، وليس فتح CORS بصمت كسلوك احتياطي.
- **development/test**: إن كان غير معرَّف، تُستخدم منافذ Vite المحلية
  الافتراضية (`http://localhost:5173`, `http://localhost:4173`) — لا
  احتكاك في التطوير المحلي، وتبقى قائمة صريحة أيضًا وليست `"*"`.

`CORS_ALLOWED_ORIGINS` أُضيف كحقل اختياري في `env.validation.ts`
(`@IsOptional() @IsString()`) — القيمة الفعلية تُحلَّل/تُنظَّف
(`trim`, تصفية الفراغات) داخل `cors.config.ts` نفسه. راجع
`backend/.env.example` للتوثيق الكامل والمثال.

## Logging المهيكل — لا يُسجَّل أي سرّ أبدًا (Milestone 2)

`RequestIdMiddleware` (`src/common/middleware/request-id.middleware.ts`)
يُلحق معرّف ارتباط (`requestId`) بكل طلب — يعيد استخدام رأس
`x-request-id` الوارد إن وُجد، وإلا يولّد UUID جديدًا، ويُرجعه دائمًا في
رأس الاستجابة. `LoggingInterceptor`
(`src/common/interceptors/logging.interceptor.ts`، مُسجَّل كـ
`APP_INTERCEPTOR` عام في `app.module.ts`) يكتب سطر JSON واحد لكل طلب:
`requestId`, `method`, `path`, `status`, `durationMs` فقط.

**لا رؤوس (headers)، لا معاملات استعلام (query params)، ولا جسم
الطلب/الاستجابة (body) تصل إلى هذا الـinterceptor على الإطلاق** — الحقول
التي قد تحمل كلمة مرور، JWT، refresh token، أو مفتاح API لا تُقرأ منها
أبدًا، لا أن تُقرأ ثم تُخفى (masking). ليست منصة Observability كاملة —
فقط ما يكفي لتشخيص "ماذا حدث" في Demo/Staging.

## حماية أسرار التكامل
- بيانات اعتماد أي `integration_connection` (رموز API، مفاتيح) تُشفَّر عند
  التخزين (encryption at rest) بمفتاح مُدار خارج قاعدة البيانات (متغير بيئة/
  Secret manager) — لا تُخزَّن نصًا صريحًا أبدًا.
- لا تُطبع أسرار التكامل أو التوكنات كاملة في الـLogs.

## نطاق الفروع/المستودعات — مُفعَّل من المرحلة 2.1

> راجع `DOMAIN_MODEL.md` القسم المخصص لهذا الموضوع للنموذج الكامل. الملخص
> الأمني هنا فقط.

**النموذج**: `Permission` + `Scope` معًا، وليس أحدهما بديلًا عن الآخر.
`PermissionsGuard` يبقى دون تغيير (401/403 عام: هل تملك هذه العضوية هذه
الصلاحية في أي مكان بالمنشأة؟). فوق ذلك، عند لمس مورد مرتبط بمستودع، تستدعي
`InventoryService`/`StockCountService` (وحدة `inventory`)
`BranchScopeService.getScopeForPermission(tx, membershipId, permissionKey)`
(وحدة `iam`) للحصول على مجموعة الفروع التي يُغطّيها هذا الإسناد لهذه
الصلاحية تحديدًا (`MembershipRole.branchId`: `null` = كل الفروع، محدَّد =
ذلك الفرع وكل مستودعاته)، ثم يتحقق أن فرع المستودع المطلوب ضمنها قبل أي
كتابة.

**رمز الرفض**: **404** يبقى لعدم انتماء المستودع للمنشأة إطلاقًا (سلامة
مرجعية عبر المنشآت، كما في المرحلة 2). **403** جديد في 2.1: المستودع ينتمي
للمنشأة فعلًا، لكن نطاق هذه العضوية لهذه الصلاحية لا يغطي فرعه. هذا الفصل
متعمَّد ويسمح للعميل (والـLogs) بتمييز "هذا غير موجود لديك" عن "هذا موجود
لكن ليس لك صلاحية عليه".

**القوائم لا تُرفض، تُصفَّى**: `GET /inventory/stock-levels`, `/movements`,
و`GET /inventory/stock-counts` لا تُرجع 403 عند تمرير `warehouseId` خارج
النطاق — يُضاف كشرط `AND` عاديّ في استعلام Prisma فيُرجع نتيجة فارغة (200)،
بنفس اتفاقية عزل المستأجرين الصامتة المستخدمة في كل قوائم هذا النظام (قرار
مقصود لتفادي كسر اختبار عزل المستأجرين القائم الذي يتوقع 200 فارغ عند تمرير
`warehouseId` من منشأة أخرى في استعلام قائمة). الرفض الصريح (403) مقصور على
عمليات مورد واحد محدد: تسوية، تحويل (كلا الطرفين)، رصيد افتتاحي،
إنشاء/قراءة-بمعرّف/تحديث سطور/اعتماد/إلغاء جرد.

**IDOR**: عضو يملك `inventory.adjust` صالحة + `warehouseId` تابع لمنشأته
الصحيحة لكن لفرع خارج نطاقه ⇐ 403 (مُختبَر صراحة في
`test/phase2.e2e-spec.ts`، قسم "نطاق الفروع/المستودعات"، بما في ذلك سيناريو
متعدد المستأجرين بمنشأتين وثلاثة فروع وأربعة مستخدمين بنطاقات مختلفة).
عضوية معلَّقة (`suspended`) تفقد كل وصول فورًا كما في المرحلة 1 — `403` عبر
`MembershipGuard`، قبل حتى الوصول لفحص النطاق.

**Products/Customers/Suppliers**: تبقى tenant-wide بلا أي قيد فرع — قرار
مقصود، راجع `DOMAIN_MODEL.md` لتفاصيل السبب.

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

## POS/Sale — تفويض المستودع/الفرع/جهاز POS (المرحلة 3)

`SalesService.createSale` لا يثق بأي `branchId` من العميل — لا يوجد حقل
`branchId` في `CreateSaleDto` إطلاقًا. التسلسل الفعلي:

1. `warehouseId` (المُرسَل) → يُتحقَّق أنه ينتمي لنفس المنشأة (404 إن لم
   ينتمِ) → `branchId` يُشتق من `warehouse.branchId` نفسه.
2. نطاق العضوية لصلاحية `sales.create` (`BranchScopeService.getScopeForPermission`،
   نفس نموذج المرحلة 2.1 بلا أي تعديل) يُتحقَّق مقابل ذلك الفرع المُشتَق —
   403 إن كان المستودع تابعًا للمنشأة الصحيحة لكن لفرع خارج نطاق العضوية.
3. `posDeviceId` (اختياري، إن أُرسل): يُتحقَّق أنه ينتمي لنفس المنشأة (404)،
   أنه `active` (409 إن لم يكن)، وأنه يتبع **نفس فرع** المستودع المحدد (409
   إن اختلف — منع صريح لجهاز POS تابع لفرع من تنفيذ عملية في فرع آخر، كما
   طُلب صراحة في مواصفات المرحلة).
4. `customerId` (اختياري): يُتحقَّق أنه ينتمي لنفس المنشأة فقط (404) — بلا
   فحص نطاق فرع، لأن العملاء tenant-wide بتصميم المرحلة 2 (لم يتغيّر).
5. كل `productId` في البنود: يُتحقَّق أنه ينتمي لنفس المنشأة و`isActive`
   (404/409).

**IDOR**: عضو يملك `sales.create` صالحة + `warehouseId` تابع لمنشأته الصحيحة
لكن لفرع خارج نطاقه ⇐ 403. عضو من منشأة أخرى تمامًا يستخدم `warehouseId`/
`posDeviceId`/`customerId`/`productId` تابعين لمنشأة الضحية ⇐ 404 في كل حالة
(الموارد غير مرئية أصلًا عبر RLS + الفحص الصريح). مُختبَر صراحة بمصفوفة كاملة
في `test/phase3.e2e-spec.ts` قسم "التفويض"، بما فيها سيناريو متعدد
المستأجرين ومتعدد الفروع.

## Idempotency وحماية التكرار (المرحلة 3)

`Sale.clientReferenceId` (فريد لكل `companyId`) هو خط الدفاع الوحيد ضد بيع
مكرر من طلب مُعاد (Timeout، إعادة محاولة من الواجهة، إلخ). فحص سريع أولًا
(بحث عن سجل موجود بنفس المفتاح)، ثم قيد تفرّد في قاعدة البيانات كخط دفاع
ثانٍ ضد سباق تزامن حقيقي (طلبان يصلان في نفس اللحظة) — `SalesController`
يلتقط انتهاك القيد ويُعيد السجل الأصلي بدل خطأ. مُختبَر بطلب متكرر تسلسليًا
و5 طلبات متزامنة حقيقية بنفس المفتاح؛ كلاهما ينتج سجلًا واحدًا فقط. راجع
`docs/SALES.md` "Idempotency" للتفصيل الكامل.

## سلامة تزامن خصم المخزون عند البيع (المرحلة 3)

لا مسار كتابة جديد — `SalesService.createSale` يستدعي
`InventoryService.recordMovement` (نفس الدالة الذرّية من المرحلة 2، غير
مُعدَّلة) لكل بند بيع. مُختبَر صراحة: عمليتا بيع متزامنتان حقيقيتان تحاولان
بيع كمية تتجاوز المتاح مجتمعتين — واحدة فقط تنجح، والأخرى تُرفض بـ409 دون أي
احتمال لرصيد سالب، وبيع فاشل لا يُنشئ أي سجل `Sale` (`test/phase3.e2e-spec.ts`
"التزامن"). نفس اختبار تزامن الـ10 طلبات من المرحلة 2 استمر بالنجاح بلا
تعديل.

## المشتريات/المصروفات/المحاسبة — تفويض ونطاق (المرحلة 4)

**RLS**: نفس نمط `FORCE ROW LEVEL SECURITY` + policy `tenant_isolation`
المستقل لكل جدول، مُطبَّق بلا استثناء على الجداول الثمانية الجديدة
(`purchases, purchase_items, purchase_sequences, expense_categories,
expenses, accounts, journal_entries, journal_lines`). مُختبَر صراحة عبر
استعلام Prisma مباشر (بدون طبقة الخدمة) على `purchases`/`expenses`/
`accounts`/`journal_entries` يتحقق أن RLS وحدها تمنع القراءة عبر المنشآت
(`test/phase4.e2e-spec.ts`).

**نطاق الفرع يمتد لكيانين جديدين**: `BranchScopeService` (بلا أي تعديل
على نموذجه، نفس الخدمة من المرحلة 2.1) يُفرَض الآن على `Purchase` (عبر
فرع مستودعها، في `createPurchase`/`receivePurchase`/`cancelPurchase`) وعلى
`Expense` **حين تحمل `branchId` فعليًا** (`createExpense`/`updateExpense`/
`deleteExpense`) — مصروف بلا فرع (مستوى المنشأة) لا يخضع لفحص نطاق فرع
أصلًا. نفس رمزَي الرفض من المرحلة 2.1: `404` لعدم انتماء المستودع/الفرع
للمنشأة، `403` لخرق نطاق الفرع رغم الانتماء الصحيح. مُختبَر صراحة: عضو
مقيّد بفرع لا يمكنه الشراء لمستودع فرع آخر بنفس المنشأة (403)؛ مصروف
مرتبط بفرع خارج نطاق العضوية (403) (`test/phase4.e2e-spec.ts`).

**Idempotency**: نفس نمط `Sale.clientReferenceId` حرفيًا يمتد إلى
`Purchase.clientReferenceId` و`Expense.clientReferenceId` (مسار سريع +
قيد تفرّد في قاعدة البيانات + التقاط `P2002` على مستوى الـController).
مُختبَر بطلبات متزامنة حقيقية لكل من إنشاء الشراء والمصروف
(`test/phase4.e2e-spec.ts`).

**تزامن استلام الشراء**: `receivePurchase` يستخدم `UPDATE ... WHERE
status = 'ordered'` محروسًا ذرّيًا (نفس عائلة نمط `recordMovement`) يمنع
استلام أمر الشراء مرتين ومضاعفة المخزون تحت تزامن حقيقي. راجع
`docs/PURCHASING.md` "التزامن".

**`accounting.manage` منفصلة تمامًا عن `accounting.read`**: الأولى تتحكم
حصرًا بإنشاء/تعديل صف `Account` (هيكل دليل الحسابات) — **لا علاقة لها
بترحيل أي قيد محاسبي**. عضو قد يملك `accounting.manage` (لضبط الحسابات)
دون أي قدرة على التأثير على الدفتر التاريخي.

**لا Endpoint لترحيل قيد محاسبي — خاصية أمنية بحد ذاتها**:
`JournalEntriesController` قراءة فقط بتصميم الكود نفسه (لا `POST`/
`PATCH`/`DELETE` مُعرَّف على الإطلاق تحت `/accounting/journal-entries`) —
لا يوجد سيناريو يمكن فيه لأي مستخدم، مهما كانت صلاحياته أو مهما حاول
التلاعب بالطلب، أن يُنشئ أو يُزوّر قيد دفتر أستاذ عبر الـAPI، لأن سطح
الهجوم نفسه غير موجود، وليس فقط محميًا بصلاحية. مُختبَر صراحة
(`test/phase4.e2e-spec.ts` "لا يوجد Endpoint لإنشاء أو تعديل قيد محاسبي
يدويًا"). راجع `docs/JOURNAL_ENTRIES.md` "لا إدخال يدوي مزدوج".

**سلامة القيد المحاسبي (Double-Entry Integrity)**: `JournalService
.postJournalEntry` — نقطة العبور الداخلية الوحيدة لترحيل أي قيد — يرفض
أي قيد غير متوازن (مدين ≠ دائن) أو بقيمة صفرية قبل أي كتابة لقاعدة
البيانات. راجع `docs/JOURNAL_ENTRIES.md` "التحقق من توازن القيد".

**IDOR**: أمر شراء أو مصروف من منشأة أخرى تمامًا غير مرئي حتى بمعرفة
الـID المباشر → `404` في كل نقطة قراءة/كتابة (RLS + الفحص الصريح، نفس
نمط `Sales` من المرحلة 3). مُختبَر صراحة (`test/phase4.e2e-spec.ts`).

## التقارير/الذمم/الأرصدة الافتتاحية/الفترات المحاسبية — تفويض ونطاق (Milestone 1)

**5 صلاحيات RBAC جديدة**: `accounting.reports.view`, `accounting.ar
.view`, `accounting.ap.view`, `accounting.opening_balance.manage`,
`accounting.period.manage` (`backend/src/modules/iam/constants/
permissions.ts`). Owner يملكها تلقائيًا عبر `ALL_PERMISSION_KEYS`؛
Manager يملك الثلاث الأولى (تشغيلي: تقارير + ذمم) بلا الأخيرتين
(إداري: أرصدة افتتاحية + فترات، محصور بالمحاسب/المالك)؛ Accountant يملك
الخمس؛ Cashier وInventory Manager لا يملكان أيًا منها. مُختبَر صراحة —
403 عند غياب كل صلاحية من الخمس (`test/milestone1.e2e-spec.ts`).

**نطاق الفرع يمتد لطبقة القراءة**: التقارير الأربعة (Trial Balance/GL/
P&L/Balance Sheet) وSubledger الذمم تستدعي
`BranchScopeService.getScopeForPermission` (نفس الخدمة، بلا أي تعديل)
لتصفية القيود حسب نطاق فروع العضوية — عضو مقيّد بفرع لا يرى في دفتر
الأستاذ إلا حركات فرعه، بينما Owner/عضو غير مقيّد يرى الكل. مُختبَر
صراحة بسيناريو فرعين وعضو محاسب مقيّد بأحدهما
(`test/milestone1.e2e-spec.ts` "نطاق الفروع في التقارير").

**IDOR**: حساب/عميل/مورد/فترة محاسبية من منشأة أخرى تمامًا → `404` في
كل نقطة قراءة (دفتر الأستاذ لحساب من منشأة أخرى، كشف حساب مورد من منشأة
أخرى، إقفال فترة من منشأة أخرى) — نفس نمط IDOR من كل مرحلة سابقة، RLS +
فحص صريح. مُختبَر صراحة (`test/milestone1.e2e-spec.ts`).

**قفل الفترة المحاسبية كخط دفاع ضد التلاعب بتاريخ القيد**: إقفال فترة
(`accounting.period.manage`) لا يخدم فقط تنظيم إعداد التقارير — هو أيضًا
ضمانة سلامة: بما أن كل قيد يُرحَّل الآن فقط (لا Backdating في هذا
النظام إطلاقًا)، فإقفال الفترة الحالية (`FiscalPeriodsService
.assertTodayNotLocked`, يُستدعى من `JournalService.postJournalEntry`
و`reverseJournalEntry` أول خطوة قبل أي كتابة) يمنع أي عملية تجارية جديدة
(بيع/شراء/مصروف/رصيد افتتاحي، وحتى عكس قيد) من التأثير على دفتر فترة
اعتُبرت مُقفلة رسميًا — دون الحاجة لأي فحص "تاريخ الفعالية" منفصل، لأن
تاريخ الترحيل **هو** تاريخ اليوم دائمًا. **لا يمنع هذا أي تعديل على قيد
مُرحَّل سابقًا** — ذلك ممنوع أصلًا وبشكل مطلق منذ المرحلة 1 (عكس فقط، لا
تعديل مباشر)؛ القفل يضيف طبقة زمنية فوق ذلك: لا قيود *جديدة* أثناء
الإقفال. مُختبَر صراحة: إقفال فترة يمنع ترحيل مصروف جديد بـ`409`،
وإعادة الفتح تسمح مجددًا (`test/milestone1.e2e-spec.ts`).

**حارس تزامن الرصيد الافتتاحي**: راجع `docs/DATABASE.md` §7 و
`docs/ACCOUNTING.md` "حارس التزامن" — فهرس فريد جزئي على
`journal_entries` يضمن رصيدًا افتتاحيًا "نشطًا" واحدًا فقط لكل منشأة،
مُختبَر بطلبين متزامنين حقيقيين (نجاح واحد فقط، `409` للآخر).

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

## استيراد من Excel — تعامل مع الملف كمصدر غير موثوق (Milestone 3)

التفصيل الكامل في `docs/IMPORT_EXCEL.md` §9 "الأمان" — ملخّص هنا للمرجعية
السريعة فقط:

- **الملف نفسه** يُتحقَّق من بصمته الحقيقية (ZIP header)، لا امتداده أو
  Content-Type المُرسَل من العميل، قبل أي تحليل.
- **حجم/عدد صفوف محدودان صراحة** (5MB / 5000 صف) — ملف يتجاوزهما يُرفَض
  كاملًا، لا اقتطاعًا صامتًا.
- **Formula/CSV injection**: أي نص حر من خلية مستوردة يُسبَق بعلامة اقتباس
  مفردة إن بدأ بـ`=`/`+`/`-`/`@` قبل أي تخزين (`sanitizeImportedText`).
- **مسارات التخزين مولَّدة من الخادم دائمًا** (`imports/<companyId>/<jobId>/source.xlsx`)
  — اسم الملف الذي يرفعه المستخدم لا يُستخدَم أبدًا لبناء مسار على القرص،
  فـPath traversal غير ممكن بنيويًا لا بفحص فقط.
- **لا Endpoint لتنزيل ملف خام** — القراءة الوحيدة داخلية، بعد تحقق ملكية
  `companyId` صريح + RLS على `import_jobs`.
- **RBAC جديد ضيق فقط**: `import.read`/`import.create` — لا صلاحيات
  إضافية، ولا تعديل على `PermissionsGuard`/`RequirePermissions` الموجودَين
  أصلًا.
- **نطاق الفروع**: استيراد الرصيد الافتتاحي يمر عبر نفس فحص
  `BranchScopeService` الذي يفرضه `InventoryService.setOpeningBalance`
  أصلًا — لا Bypass جديد لأي فحص موجود.
- **كل صف مستورَد فعليًا يُدقَّق** عبر Audit logging الخدمة المستهدفة نفسها
  (لا ازدواج)، بالإضافة لتدقيق مستوى المهمة (رفع/ربط/تحقق/بدء وانتهاء
  الاستيراد/إلغاء).

## ZATCA E-Invoicing Readiness (Milestone 4 — Phase 1 فقط)

التفصيل الكامل في `docs/ZATCA.md` — ملخّص أمني هنا للمرجعية السريعة:

- **لا اتصال خارجي**: لا استدعاء شبكي حقيقي لأي واجهة برمجية لهيئة الزكاة
  والضريبة والجمارك في هذا الـMilestone — توليد رمز QR محلي بالكامل.
  `ZatcaProvider` (منفذ Phase 2 المستقبلي) معرَّف كواجهة فقط، **غير
  مُنفَّذ وغير مسجَّل في أي مكان**.
- **لا أسرار جديدة**: لا CSID، لا مفتاح خاص، لا شهادة — لأن لا شيء منها
  ضروري لتوليد QR محليًا. لم تُبنَ أي `CertificateProvider`/
  `SecretProvider` لعدم وجود استخدام فعلي بعد يبرر بناءها.
- **`LoggingInterceptor` غير معدَّل ولم يُخالَف**: لا يزال يسجّل فقط
  `requestId`/`method`/`path`/`status`/`durationMs` — رمز QR نفسه (مشتق
  من بيانات فاتورة مخزَّنة أصلًا، وليس سرًا) لا يظهر في أي سطر Log بأي
  حال، لأن جسم الاستجابة لا يُسجَّل أصلًا لأي Endpoint.
- **RLS**: `invoice_compliance` بنفس نمط `FORCE ROW LEVEL SECURITY` +
  `tenant_isolation` كأي جدول تجاري آخر — لا استثناء جديد.
- **عزل مستأجرين**: سجل الامتثال يُقرأ فقط ضمن استجابة `GET /invoices`
  الموجودة أصلًا (نفس فحوصات الملكية/RLS المطبَّقة عليها بالفعل) — لا
  Endpoint مستقل جديد يحتاج فحص IDOR منفصل.
- **لا RBAC جديد**: صلاحية `invoices.read` الموجودة أصلًا تكفي — لم
  تُضَف صلاحية جديدة، ولم يُعدَّل `PermissionsGuard`.
- **رمز QR غير كامل لا يُولَّد أبدًا**: إن لم يوجد رقم ضريبي مسجَّل
  للمنشأة، لا يُنشأ رمز QR إطلاقًا (`null`) بدل توليد رمز ببيانات ناقصة
  يوهم بامتثال غير حقيقي.

## تقييم المخزون / COGS — تكلفة مُشتقّة خادميًا بالكامل (Milestone 6)

- **لا مسار يقبل تكلفة/COGS من العميل عند البيع**: `CreateSaleDto`/
  `SaleItemInputDto` لا يحملان أي حقل تكلفة أصلًا — `ValidationPipe`
  بإعداد `forbidNonWhitelisted: true` (موجود منذ Phase 1) يرفض أي محاولة
  إرسال `unitCost`/`cogs` ضمن سطر بيع بـ400 قبل وصولها لأي منطق أعمال.
  مُختبَر صراحة (`test/milestone6.e2e-spec.ts`).
- **مصدر التكلفة الوحيد**: `InventoryValuationService`، الذي يقرأ فقط من
  `StockLevel.averageCost` (مُحدَّث خادميًا) أو من حقل `unitCost` صريح
  يُرسله مستخدم مصرَّح له (`inventory.adjust` لتسويات/رصيد افتتاحي،
  `purchases.create` لأمر شراء) — لا مسار فيه العميل يتحكم بقيمة COGS
  النهائية لعملية بيع.
- **سلامة التزامن مُمدَّدة، لا فجوة جديدة**: `average_cost` يُكتَب ضمن
  **نفس** الاستعلام الذرّي المحروس الذي يكتب `quantity_on_hand` منذ
  Phase 2 (`docs/DATABASE.md` §2، `docs/INVENTORY.md` "Concurrency") —
  لا قراءة-ثم-حساب-ثم-كتابة منفصلة لحساب المتوسط يمكن أن تتسابق. مُختبَر
  بعمليتي شراء متزامنتين حقيقيتين وبـ10 عمليات بيع متزامنة حقيقية على
  رصيد محدود (`test/milestone6.e2e-spec.ts` "التزامن").
- **لا RBAC/Endpoint/صلاحية جديدة**: حقلا `unitCost` الاختياريان الجديدان
  أُضيفا لـDTOs موجودة أصلًا (`SetOpeningBalanceDto`، `AdjustStockDto`)
  خلف نفس صلاحية `inventory.adjust` الموجودة، لا صلاحية جديدة. حقلا
  `costOfGoodsSold`/`grossProfit` في تقرير P&L خلف نفس
  `accounting.reports.view` الموجودة.
- **عزل مستأجرين/نطاق فروع بلا تغيير**: `average_cost` عمود على
  `StockLevel` الموجود أصلًا — يرث نفس RLS ونفس فحص نطاق المستودعات/
  الفروع بلا أي كود إضافي.

## العمليات التجارية الجديدة — تفويض وتزامن وسلامة مالية (Milestone 7)

- **لا مبلغ/حساب محاسبي يُقبَل من العميل في أي مسار جديد**: `RecordSalePaymentDto`/
  `RecordSupplierPaymentDto`/`CreateSaleReturnDto`/`CreatePurchaseReturnDto`/
  `CreateBankReconciliationDto` تحمل فقط `method`/`amount`/`quantity`/
  `reason`/`clientReferenceId`/`asOfDate`/`statementBalance` — لا `accountCode`
  حر (`CreateBankReconciliationDto.accountCode` مُقيَّد بـ`@IsIn([CASH,
  BANK])`)، ولا `journalLines`، ولا `bookBalance`/`cogs`/`unitCost` قابل
  للإرسال. كل مبلغ محاسبي فعلي (الرصيد المستحق، قيمة الإرجاع، الرصيد
  الدفتري) يُشتَق خادميًا من `JournalLine`/`SaleItem`/`PurchaseItem`
  الفعلية، تمامًا كنمط Milestone 6 لـCOGS. `ValidationPipe`
  (`forbidNonWhitelisted: true`) يرفض أي حقل إضافي بـ400.
- **منع الدفع الزائد (Overpayment) بقفل صف حقيقي، لا فحص تطبيقي فقط**:
  `SalesService.recordPayment`/`PurchasesService.recordPayment` كلاهما
  يُصدِران `SELECT id FROM sales/purchases WHERE id=... FOR UPDATE` **قبل**
  حساب `outstanding = total - SUM(payments)` وإدراج صف الدفع الجديد، ضمن
  نفس معاملة `withTenant` — طلبا دفع متزامنان حقيقيان على نفس البيع/الشراء
  يُسلسَلان على قفل الصف، فلا يمكن لأحدهما رؤية رصيدًا قديمًا غير محدَّث.
  مُختبَر بطلبي HTTP متزامنين حقيقيين (`test/milestone7.e2e-spec.ts`
  "دفعتان متزامنتان").
- **منع تجاوز الكمية القابلة للإرجاع بنفس النمط**: `SalesReturnService`/
  `PurchaseReturnService` يقفلان صف `sale_items`/`purchase_items`
  (`SELECT ... FOR UPDATE`) قبل حساب الكمية المُرجَعة سابقًا (مجموع
  `SaleReturnItem`/`PurchaseReturnItem` الموجودة) والتحقق من الكمية
  الجديدة المطلوبة — يُسلسِل طلبات إرجاع متزامنة حقيقية على نفس السطر.
- **لا مصادقة عابرة للعملاء/الموردين/المنشآت**: `recordPayment` على كلا
  المسارين يتحقق أن الصف الأب (`sale`/`purchase`) ينتمي لنفس `companyId`
  (`404` غير ذلك، RLS تمنع القراءة أصلًا) **وأن مفتاح `clientReferenceId`
  المُعاد استخدامه يخص نفس `saleId`/`purchaseId`** — لا يمكن لطلب مكرر
  بنفس المفتاح "الانزلاق" لتحديث سجل مختلف (`409` إن اختلف). مُختبَر صراحة
  (تسوية مورد/بيع عبر منشأة أخرى، `test/milestone7.e2e-spec.ts` "عزل
  المستأجرين وحماية IDOR").
- **رفض العمليات على حالة غير صالحة**: دفعة/مرتجع على بيع ملغى (`409`)،
  دفعة/مرتجع مشتريات على أمر شراء لم يُستلَم بعد (`409`) — كلاهما مُتحقَّق
  قبل أي كتابة، لا بعدها.
- **نطاق الفروع (Branch Scope) مُطبَّق على كل مسار جديد** بنفس نمط
  `BranchScopeService.getScopeForPermission` الموجود أصلًا — `sales
  .payment.record`/`sales.return`/`purchases.payment.record`/`purchases
  .return` تتحقق من نطاق فرع البيع/الشراء الأصلي قبل أي عملية (`403` خارج
  النطاق).
- **RBAC — 5 صلاحيات جديدة بتوزيع مبني على فصل المهام**: راجع
  `docs/ACCOUNTING.md` "RBAC" لجدول التوزيع الكامل والمنطق وراءه (تحصيل
  عميل تشغيلي واسع، مرتجع مبيعات مُقيَّد كإلغاء البيع، دفع مورد وظيفة
  خزينة/محاسبة، مرتجع مشتريات عملية مخزون، تسوية بنكية محاسبية بحتة).
- **التسوية البنكية لا تتصل بأي جهة خارجية**: `statementBalance` رقم
  يُدخله المستخدم يدويًا فقط — لا HTTP خارج، لا بيانات اعتماد بنكية
  مُخزَّنة، لا سطح هجوم شبكي جديد.
- **RLS بلا استثناء**: الجداول الستة الجديدة
  (`supplier_payments, sale_returns, sale_return_items, purchase_returns,
  purchase_return_items, bank_reconciliations`) كلها `FORCE ROW LEVEL
  SECURITY` + policy `tenant_isolation`، مُتحقَّقة مباشرة عبر استعلام SQL
  خام عابر للمنشآت (`test/milestone7.e2e-spec.ts` بنفس نمط الفحص المباشر
  المُستخدَم منذ Phase 4).

## SaaS / الاشتراك — تفويض وحدود استخدام وعزل مستأجرين (Milestone 8)

- **طبقة تفويض إضافية، لا بديلة عن RBAC**: `SubscriptionGuard` (`APP_GUARD`
  عام) يعمل **بعد** `PermissionsGuard` في سلسلة الحراس — مالك بكل صلاحيات
  RBAC (`Role: Owner`) لا يزال يُمنَع `403` من ميزة غير مشمولة بخطة
  منشأته (`@RequireFeature`). مُختبَر صراحة
  (`test/milestone8.e2e-spec.ts` "خطة الأساسية لا تشمل استيراد Excel ولا
  الذمم - حتى لمالك يملك كل صلاحيات RBAC").
- **لا تسريب معلومات اشتراك داخلية**: رسائل الرفض تذكر اسم الميزة
  العربي وحالة الاشتراك فقط — لا معرّفات داخلية (`Plan.id`،
  `Subscription.id`) تظهر في أي استجابة خطأ أو في `/subscriptions/me`.
- **RLS بلا استثناء على `subscriptions`**: `FORCE ROW LEVEL SECURITY` +
  policy `tenant_isolation`، مُتحقَّقة مباشرة عبر استعلام SQL خام عابر
  للمنشآت (`test/milestone8.e2e-spec.ts` "لا يمكن لمنشأة قراءة اشتراك
  منشأة أخرى عبر RLS المباشر"). `plans` كتالوج عام بلا RLS عمدًا (نفس
  معاملة `permissions`) — لا بيانات خاصة بمنشأة فيه.
- **لا IDOR على تغيير خطة/اشتراك**: لا يوجد endpoint تعديل واحد يقبل
  `companyId`/`planId` من التاجر أصلًا (راجع `docs/API.md` "Milestone
  8") — مُختبَر صراحة بإرسال طلب `POST /subscriptions/me` بجسم يحاول
  استهداف منشأة أخرى، يُرفَض `404` (المسار غير موجود أصلًا، لا حتى
  محاولة معالجة).
- **حدود استخدام آمنة للتزامن، لا فحص-ثم-إنشاء ساذج**: `SubscriptionService
  .assertWithinLimit` يُصدِر `SELECT id FROM subscriptions WHERE
  company_id=... FOR UPDATE` **قبل** عدّ الموارد الحالية ومقارنتها بحد
  الخطة، ضمن نفس معاملة العملية المُنشِئة (فرع/مستخدم/بيع) — طلبان
  متزامنان حقيقيان يتسابقان على آخر مقعد متاح يُسلسَلان على قفل الصف،
  فينجح واحد بالضبط ويُرفَض الآخر `403`، مهما كان التوقيت. مُختبَر
  بطلبي HTTP متزامنين حقيقيين (`Promise.all`) في
  `test/milestone8.e2e-spec.ts` "طلبان متزامنان على آخر مقعد مستخدم
  متاح".
- **منشأة موقوفة (`CompanyStatus.suspended`) — أول تفعيل فعلي لهذا
  الحقل**: كان موجودًا في الـschema منذ Phase 1 بلا أي إنفاذ. الآن يمنع
  كل الطلبات ما عدا مسار استعادة/اطلاع صغير مُعفى صراحة
  (`@SubscriptionExempt()`: `/auth/me`, `/auth/logout`, `/auth/refresh`,
  `/auth/tenants`, `/auth/switch-tenant`, `/subscriptions/me`,
  `/subscriptions/plans`) — "لا تُقفَل كل معلومة مفيدة عن التاجر" حتى في
  أشد حالات التقييد.
- **اشتراك مقيَّد (`expired`/`suspended`/`cancelled`) يمنع الطلبات
  المُغيِّرة فقط**: القراءة (`GET`) تبقى متاحة دومًا — مبدأ "الاطلاع على
  الحساب أثناء التقييد" (Milestone 8 spec section 10)، مُختبَر صراحة
  (`GET /sales` ينجح، `POST /sales` يُرفَض `403`، على نفس المنشأة
  المنتهية التجربة).
- **لا مسارات امتيازية مكشوفة لمركز تحكم مستقبلي**: `SubscriptionService
  .changePlan`/`setStatus`/`extendTrial` موجودة على مستوى الخدمة فقط —
  لا Controller يستدعيها في هذا الـMilestone، تفاديًا لكشف عمليات
  امتيازية بلا بنية مصادقة إدارية حقيقية بعد (لا اختراع بنية مصادقة
  خارجية جديدة).
- **Audit غير قابل للتزوير**: كل انتقال دورة حياة اشتراك
  (`subscription.created`, `subscription.trial_started`,
  `subscription.trial_expired`, ...) يُسجَّل من داخل `SubscriptionService`
  فقط ضمن نفس معاملة الكتابة — لا مسار API يقبل حقل `action`/`entityType`
  حرًا يسمح للتاجر بتزوير سجل Audit خاص باشتراكه.

## تكامل قيّدها Inbound — مصادقة خارجية منفصلة، عزل، وسلامة تزامن (Milestone 9)

- **طبقة مصادقة كاملة منفصلة عن JWT**: `QeedhaIntegrationAuthGuard`
  تُطبَّق فقط على `QeedhaTransactionController` عبر `@Public()` (يتخطى
  سلسلة الحراسة العادية بالكامل: JWT/Membership/Permissions/Subscription)
  + `@UseGuards(QeedhaIntegrationAuthGuard)` الخاص بها. لا اختراع نظام
  Auth ثانٍ من الصفر — تعيد استخدام `hashToken` (نفس دالة تجزئة
  `refresh_tokens`) و`AuthLookupService`/دور Postgres الضيق
  `qeedha_auth_lookup` (BYPASSRLS، موجود منذ الـMilestone الأول لتسجيل
  دخول المستخدمين قبل توفر سياق Tenant) — امتداد صلاحيات جديد
  (`prisma/manual-sql/003_auth_lookup_role_integration.sql`) بدل آلية
  Bootstrap منفصلة.
- **مقارنة السر بوقت ثابت**: `crypto.timingSafeEqual` على تجزئة السر
  المُرسَل مقابل `secretHash` المخزَّن — يمنع تسريب توقيت مطابقة جزئية
  لمهاجم يجرّب أسرارًا.
- **لا `companyId` من الطالب على الإطلاق**: كل مسار تحت هذا الـGuard
  يشتق سياق المنشأة **حصرًا** من الربط المُصادَق عليه
  (`request.integrationConnection`) — لا DTO في هذه الوحدة يملك حقل
  `companyId`. `externalMerchantId` المُرسَل من قيّدها يُقارَن دفاعًا في
  العمق مع `connection.publicReference` المُصادَق عليه فعليًا، لا يُستخدَم
  وحده لتحديد المنشأة.
- **لا معرّفات قاعدة بيانات داخلية في العقد الخارجي**: `publicReference`
  (وليس `IntegrationConnection.id`) هو "معرّف التاجر الخارجي"؛
  `Branch.code`/`Invoice.invoiceNumber` الموجودان أصلًا (وليس أي `id`)
  هما مرجعا الفرع/الفاتورة الخارجيان؛ لا استجابة (`toSafeView`/
  `toResponse`) تُسرّب `secretHash` أو أي `id` داخلي.
- **RLS كاملة على الجدولين الجديدين**: `integration_customer_mappings`
  و`integration_transactions` بنفس نمط `FORCE ROW LEVEL SECURITY` +
  `tenant_isolation` policy المُستخدَم في كل جدول تجاري — مُتحقَّقة مباشرة
  عبر `prisma.withTenant` عابر للمنشآت في `test/milestone9.e2e-spec.ts`
  ("منشأة لا يمكنها قراءة ربط تكامل منشأة أخرى عبر RLS المباشر"). رمز
  ربط منشأة A لا يمكنه أبدًا حل/عرض/إلغاء أي شيء يخص منشأة B، حتى بمرجع
  صحيح تمامًا (مُختبَر صراحة).
- **حماية سباق التزامن بقيود قاعدة البيانات، لا قفل ذاكرة**: مسارَا
  تزامن مختلفان بتقنيتين مختلفتين حسب طبيعة كل سباق —
  1) **تسوية معاملة مكررة**: قيد Unique حقيقي
     (`Payment.clientReferenceId`) داخل `recordPaymentCore` (نفس نمط
     Milestone 7) — 10 طلبات متزامنة حقيقية (`Promise.all`) بنفس
     `idempotencyKey` تُنشئ معاملة مالية واحدة بالضبط، الباقي يُلتقَط
     `P2002` على مستوى الـController ويُعاد جلب النتيجة الأصلية بدل
     تكرارها (نفس نمط `SalesController.createSale`).
  2) **حل عميل خارجي مكرر**: قفل Postgres Advisory
     (`SELECT pg_advisory_xact_lock(hashtext($1))`، ضمن المعاملة نفسها)
     — تقنية جديدة في هذا المستودع، مُختارة تحديدًا لأن قيد Unique وحده
     كان يسمح بسباق ينشئ صف `Customer` مكرر قبل أن يكتشف قيد Unique
     الخاص بجدول Mapping المشكلة.
- **معدل الطلبات (Rate limiting)**: يعيد استخدام `ThrottlerModule` العام
  الموجود (`APP_GUARD`، 100/60 ثانية افتراضيًا لكل IP) — لا نظام محدود
  معدل ثانٍ. `POST connection` محدود إضافيًا إلى 40/60 ثانية (نفس رتبة حد
  تسجيل منشأة جديدة)؛ `POST transactions` محدود إلى 300/60 ثانية (أعلى
  من الافتراضي، مسار عالي التكرار الشرعي). **قيد مُوثَّق بصدق**: الحد
  مبني على IP لا على الربط — إن شاركت عدة منشآت IP قيّدها الصادر، الحد
  يُطبَّق عليها تراكميًا.
- **إلغاء لا يعكس دفعة مُسدَّدة بالفعل**: قرار أمان/سلامة محاسبية متعمَّد
  — `cancel()` يرفض `409` حاسمًا أي محاولة إلغاء معاملة `SUCCESS`، بدل
  اختراع منطق عكس محاسبي جديد قد يكسر توازن قيود موجودة. راجع
  `docs/QEEDHA_INTEGRATION.md` §"تحديث Milestone 9" للتفصيل.
- **لا تسريب سر بأي شكل**: السر الخام (`secret`) يُعاد **مرة واحدة فقط**
  في استجابة `POST /qeedha-integration/connection` (JSON، عبر HTTPS في
  الإنتاج) ولا يُخزَّن أبدًا بشكل قابل للاسترجاع (`secretHash` فقط) — لا
  Log، لا Audit، لا استجابة أخرى يحتوي القيمة الخام. مُختبَر صراحة أن
  `secretHash` ≠ السر الخام وأن الصف الكامل من قاعدة البيانات لا يحتوي
  السر الخام كنص فرعي.
- **Audit كامل لكل انتقال حالة**: `qeedha_integration.connection.link/
  rotate/revoke`, `qeedha_integration.customer.resolve`,
  `qeedha_integration.transaction.create/fail/cancel`,
  `qeedha_integration.payment.record` — كلها ضمن نفس معاملة الكتابة، لا
  مسار يقبل حقل Audit حرًا من الطالب.
- **RBAC بحد أدنى**: صلاحيتان جديدتان فقط (`integration.read`،
  `integration.manage`) على المسارات الموجّهة للتاجر — المسارات الخارجية
  لا تستخدم RBAC إطلاقًا (المصادقة بالسر هي الحد الفاصل الوحيد).

## تدقيق الإصدار الإنتاجي النهائي (Milestone 10)

مراجعة أمنية شاملة قبل الإصدار — راجع `docs/PROJECT_STATUS.md`
"Milestone 10" لتفاصيل التنفيذ والاختبار الكاملة. أهم ما تغيّر فعليًا:

- **فحص أسرار إنتاجي جديد وفاشل-إغلاقًا (fail-closed)**:
  `assertSecretsProductionSafe` (`backend/src/config/env.validation.ts`)
  يرفض بدء التطبيق في `NODE_ENV=production` إن كان أي من الأسرار
  الأربعة (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `JWT_TENANT_SELECTION_SECRET`, `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY`)
  لا يزال يحمل القيمة الحرفية من `.env.example`، أقصر من 32 حرفًا، أو
  مطابقًا لسر JWT آخر — نفس نمط `assertCorsConfiguredForProduction`
  الموجود منذ Milestone 2. **قبل هذا الفحص، كان بالإمكان تشغيل نسخة
  إنتاج فعلية بأسرار `change-me-...` الافتراضية بصمت تام** — هذه كانت
  ثغرة تهيئة إنتاجية حقيقية أُغلِقت في هذا الـMilestone، مُختبَرة صراحة
  (`env.validation.spec.ts`، 5 اختبارات).
- **إصلاح سكربت `manual-sql/001_auth_lookup_role.sql`**: كان يحمل عطلين
  حقيقيين موجودين منذ مراحل سابقة، لم يُكتشَفا حتى محاولة تطبيق حقيقية
  في هذه الجلسة: (1) `GRANT CONNECT ON DATABASE qeedha_accounting`
  باسم قاعدة بيانات ثابت بدل `current_database()` (يفشل على أي قاعدة
  غير `qeedha_accounting` بالاسم الحرفي، بما فيها كل قواعد
  CI/الاختبار)؛ (2) `GRANT SELECT` يتضمّن عمود `users.company_id` الذي
  حُذف منذ Auth/IAM identity refactor (يفشل دائمًا، ويُلغى فورًا بواسطة
  002 على أي حال). كلاهما مُصلَح، مُعاد تطبيقهما والتحقق منهما مباشرة
  عبر `information_schema.role_column_grants`/`pg_database.datacl`.
- **إصلاح CI**: `.github/workflows/ci.yml` كان يطبّق 001/002 فقط، بلا
  003 (منح Milestone 9 الجديد على `integration_connections`) — يعني أن
  مصادقة تكامل قيّدها الخارجية كانت ستفشل بصمت في أي تشغيل CI حقيقي منذ
  Milestone 9. أُضيف السكربت الثالث لكلا الوظيفتين (`backend`, `e2e`).
- **KNOWN LIMITATION موثَّقة (لا تغيير كود)**: الواجهة الأمامية تخزّن
  access/refresh tokens في `localStorage` (`frontend/src/api/client.ts`)،
  لا `httpOnly` cookies — عرضة نظريًا لسرقة عبر XSS إن وُجدت ثغرة XSS.
  التخفيف الحالي: React يُهرِّب كل الإخراج تلقائيًا، ولا استخدام واحد
  لـ`dangerouslySetInnerHTML`/`innerHTML` في كامل الواجهة الأمامية
  (مُتحقَّق منه صراحة). التحوّل لـ`httpOnly` cookies يتطلب إعادة تصميم
  معمارية للمصادقة (CSRF protection، SameSite، تغيير عقد الـAPI
  بالكامل) — تغيير كبير وخطر على معمارية تعمل فعليًا، فتُرك كقيد موثَّق
  صراحة بدل إعادة بناء غير مُختبَرة في هذا الـMilestone (يخالف "لا تعيد
  بناء معمارية تعمل").

## هذا الملف حي
يُحدَّث مع كل مرحلة تُضيف سطح هجوم جديد (مثلًا: مرحلة ZATCA تضيف اعتبارات
تواقيع رقمية ومفاتيح تشفير خاصة بالهيئة، مرحلة Integration تضيف اعتبارات
Webhook signature verification لكل مزوّد).
