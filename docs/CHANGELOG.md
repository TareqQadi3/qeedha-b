# سجل التغييرات (Changelog)

## [Milestone 9: Qeedha Integration] - 2026-08-17

يبني طبقة تكامل **Inbound** فعلية: قيّدها (منصة مستقلة، منفصلة تمامًا عن
Qeedha B) تستدعي واجهة API جديدة لتسوية دفعات على فواتير موجودة أصلًا، عبر
عقد صريح لا يعتمد على مخطط قاعدة بيانات قيّدها الداخلي. اتجاه **Outbound**
(Qeedha B تستدعي قيّدها كمزوّد دفع عند الدفع في POS، موصوف في
`docs/QEEDHA_INTEGRATION.md` منذ Phase 3) **لم يُمَس** — لا يزال تصميمًا
معماريًا بلا Adapter فعلي. راجع `docs/QEEDHA_INTEGRATION.md`
§"تحديث Milestone 9" للتصميم الكامل.

### أُضيف

**النموذج (Prisma)**:
- `IntegrationCustomerMapping` — خريطة `externalCustomerReference` ↔
  `Customer` داخلي، فريدة لكل (منشأة، ربط، مرجع خارجي)، RLS FORCE كاملة.
- `IntegrationTransaction` — سجل معاملات تسوية الدفعات الواردة من قيّدها
  (`status: success|failed|cancelled`، بلا `pending` مزيّف)، RLS FORCE
  كاملة، مربوط اختياريًا بـ`Sale`/`Payment` (فريد)/`Customer`/`Branch`.
- `IntegrationConnection` — 5 أعمدة جديدة: `publicReference` (فريد، مرجع
  عام)، `secretHash`، `secretLastFour`، `systemMembershipId`،
  `revokedAt`.
- دور نظامي جديد `Integration` (`companyId: null`، غير قابل لتسجيل
  الدخول) + مستخدم نظامي عام واحد (`status: disabled`) في seed.
- صلاحيتان جديدتان: `integration.read`، `integration.manage`.

**الواجهة الخلفية**:
- `QeedhaConnectionService`/`QeedhaConnectionController` —
  `GET/POST/DELETE /qeedha-integration/connection` (JWT+RBAC عاديان):
  ربط/تدوير يُصدر مرجعًا عامًا وسرًّا يُعرَض مرة واحدة فقط، قطع اتصال
  يُبطل السر فورًا.
- `QeedhaIntegrationAuthGuard` — مصادقة خارجية كاملة
  (`Bearer <publicReference>.<secret>`)، تعيد استخدام `AuthLookupService`/
  دور Postgres `qeedha_auth_lookup` الموجود (امتداد صلاحيات جديد
  `003_auth_lookup_role_integration.sql`)، مقارنة سر بوقت ثابت.
- `QeedhaTransactionService`/`QeedhaTransactionController` —
  `POST customers/resolve`، `POST transactions` (تسوية دفعة، لا بيع
  جديد)، `GET transactions/:reference`، `POST transactions/:reference/cancel`
  (فاشلة → تُلغى بأمان، ناجحة → `409` حاسم دائمًا).
- `SalesService.recordExternalPayment` — طريقة عامة جديدة، تشارك منطق
  `recordPayment` الموجود (بعد فصل داخلي لدالة خاصة مشتركة
  `recordPaymentCore`) — لا محرك دفع ثانٍ.
- `AuthModule` يُصدِّر الآن `AuthLookupService` (كان بلا `exports` من قبل).

**الواجهة الأمامية**:
- صفحة `/integration` جديدة (`QeedhaIntegrationPage.tsx`) — عرض حالة
  الربط، ربط (يعرض المرجع العام والسر مرة واحدة فقط بتحذير واضح)، قطع
  اتصال بتأكيد صريح. عنصر تنقّل جديد في `Layout.tsx`.

**قاعدة البيانات**: migration واحدة
(`20260818000000_milestone9_qeedha_integration`) — جدولان جديدان + أعمدة
إضافية على `integration_connections`، لا تعديل على أي جدول آخر.

### تغيّر
- حد معدل الطلبات على `POST /qeedha-integration/connection`: من 10/60
  ثانية إلى 40/60 ثانية (نفس رتبة حد تسجيل منشأة جديدة) — قرار مُوثَّق في
  كود الـController، ليس تخفيفًا لحماية حقيقية.

### الاختبارات
- Backend: `test/milestone9.e2e-spec.ts` جديد (33 اختبارًا، 25 سيناريو
  مسمّى). **242/242** إجماليًا.
- Frontend: `QeedhaIntegrationPage.test.tsx` جديد (6 اختبارات). **53/53**
  إجماليًا.
- Playwright: `golden-path.spec.ts` مُمدَّد بقسم تكامل قيّدها (ربط/عرض
  سر مرة واحدة/قطع اتصال). **4/4** إجماليًا.

### القيود المعروفة
لا اختبار ضد بيئة قيّدها خارجية حقيقية (لا بيانات اعتماد/بيئة متاحة). لا
Webhooks جديدة (لا حاجة حقيقية في هذا التصميم المتزامن بالكامل). لا إلغاء
لمعاملة ناجحة (قرار سلامة محاسبية مُتعمَّد). راجع `docs/PROJECT_STATUS.md`
"Milestone 9" للتفصيل الكامل.

## [Milestone 8: SaaS / Subscription & Billing] - 2026-08-17

يحوّل Qeedha B إلى منتج SaaS حقيقي: نموذج خطط (`Plan`) واشتراك
(`Subscription`) لكل منشأة، فترة تجريبية 14 يومًا حقيقية بعواقب فعلية
عند الانتهاء، صلاحيات ميزات (Feature Entitlements) كطبقة **إضافية** على
RBAC وليست بديلة عنها، حدود استخدام (مستخدمون/فروع/مبيعات شهرية) بتنفيذ
آمن للتزامن، ودمج دورة حياة الاشتراك مع `CompanyStatus` الموجود سلفًا
(والذي تبيَّن أنه لم يكن مُفعَّلًا فعليًا في أي مكان قبل هذا الـ
Milestone). واجهة القراءة فقط للتاجر (`/subscriptions/me`,
`/subscriptions/plans`) — لا endpoint تعديل واحد مكشوف للتاجر. لا تكامل
دفع خارجي حقيقي (Stripe/Moyasar/... إلخ) — الفوترة الفعلية مؤجَّلة صراحةً
لمركز التحكم المستقبلي، والأسعار المعروضة (`priceMonthlySar`) placeholder
واضح، وليست تسعيرًا تجاريًا نهائيًا.

### أُضيف

**النموذج (Prisma)**:
- `Plan` — جدول كتالوج عام (بلا `company_id`، بلا RLS — نفس معاملة
  `permissions`/`integration_providers` الموجودة سلفًا): `code`, `name`,
  `description`, `isActive`, `trialEligible`, `priceMonthlySar`
  (placeholder)، `billingInterval`, `maxUsers`, `maxBranches`,
  `maxMonthlySales`, `features` (JSON بمفاتيح `FEATURE_KEYS`).
- `Subscription` — سطر واحد فريد لكل منشأة (`company_id` فريد)، بيانات
  تعيّه (tenant-scoped) بـ RLS FORCE + `tenant_isolation` كاملة:
  `status` (`SubscriptionStatus`: `trialing | active | expired |
  suspended | cancelled`), `trialEndsAt`, `currentPeriodStart/End`,
  `cancelledAt`.
- `Company.subscription` علاقة عكسية جديدة فقط — **لم يتغيّر** حقل
  `CompanyStatus` الموجود (`active | suspended`) ولا معناه.

**الواجهة الخلفية**:
- `SubscriptionService` — المصدر المركزي الوحيد لمنطق
  الخطط/الاشتراك/الصلاحيات/الحدود: `loadContext` (يحمّل ويُطبِّق
  انتقال "انتهت التجربة" بشكل كسول عند أول طلب بعد الانتهاء، مع تسجيل
  Audit)، `hasFeature`, `assertWithinLimit` (قفل صف حقيقي `SELECT ...
  FOR UPDATE` على سطر الاشتراك قبل العدّ والمقارنة، يمنع تجاوز الحد عبر
  طلبين متزامنين)، `getMerchantView`, `listPlans`، ودوال انتقال جاهزة
  لمركز تحكم مستقبلي (`changePlan`, `setStatus`, `extendTrial`) **غير
  مكشوفة عبر أي Controller في هذا الـMilestone**.
- `SubscriptionGuard` (`APP_GUARD` عام، يعمل بعد `PermissionsGuard`) —
  فحصان مستقلّان: (1) منشأة موقوفة (`CompanyStatus.suspended`) تمنع كل
  الطلبات ما عدا المسارات المُعفاة صراحة (`@SubscriptionExempt()`)؛ (2)
  اشتراك مقيَّد فعليًا (`expired|suspended|cancelled`) يمنع الطلبات
  **المُغيِّرة فقط** (POST/PUT/PATCH/DELETE) — القراءة تبقى متاحة دومًا
  (سياسة "الاطلاع على الحساب أثناء التقييد").
- `@RequireFeature(key)` — ديكوريتور جديد، طبقة إضافية فوق
  `@RequirePermissions` (لا بديل لها): تُطبَّق على مسارات POS
  (`sales.create/cancel/return`)، Inventory (`opening-balance/
  adjustments/transfers/stock-counts`)، Accounting
  (`accounts.create/update`, `opening-balance`, `fiscal-periods`,
  `reconciliations`)، Reports (كل تقارير `/accounting/reports/*`)، AR/AP
  (`payments`, `/accounting/ar/*`, `/accounting/ap/*`)، Excel Import
  (`POST /imports/jobs`). ZATCA Phase 1 مُمثَّلة كمفتاح ميزة موثَّق
  (مُفعَّل في كل خطة) دون بوابة على مسار — تبقى تلقائية ضمن
  `SalesService.createSale` كما كانت، بلا مساس بمنطقها المُثبَت.
- حدود استخدام آمنة للتزامن على 3 موارد فقط (مجموعة صغيرة ومتماسكة —
  ليس على كل جدول): `TenancyService.createBranch` (`plan.maxBranches`)،
  `IamService.createUser` (`plan.maxUsers`، يُحتسَب على كل Membership
  جديدة بغض النظر عن كون الهوية جديدة أو مُعاد استخدامها)،
  `SalesService.createSale` (`plan.maxMonthlySales`، لا يُحتسَب طلب
  مكرَّر بنفس `clientReferenceId`). لا جدول عدّاد مُخزَّن جديد — العدّ
  `COUNT(*)` مُشتقّ ضمن نفس القفل، تفاديًا لتخزين قيمة مُشتقَّة بلا داعٍ.
- `AuthService.registerCompany` يُنشئ اشتراكًا حقيقيًا (`trialing`، خطة
  Professional، تجربة 14 يومًا) لكل منشأة جديدة ضمن نفس معاملة التسجيل.
- `SubscriptionsController` (`/subscriptions/me`, `/subscriptions/
  plans`) — قراءة فقط، بلا أي endpoint تعديل، كلاهما `@SubscriptionExempt()`
  ليبقيا متاحين حتى لمنشأة موقوفة/منتهية الاشتراك.
- Audit جديد لكل انتقال دورة حياة اشتراك: `subscription.created`,
  `subscription.trial_started`, `subscription.trial_expired`، ودوال
  جاهزة لمركز التحكم (`subscription.plan_changed`, ...) — بلا أي سجل
  Audit لعمليات القراءة.

**البذر (Seed)**: خطتان في `prisma/seed.ts` (idempotent upsert بـ
`code`): `starter` (فرع واحد، 3 مستخدمين، 200 عملية بيع شهريًا، بلا
Excel Import ولا AR/AP) و`professional` (5 فروع، 15 مستخدمًا، 2000 عملية
بيع شهريًا، كل الميزات) — المنشأة الافتراضية/التجريبية تحصل تلقائيًا على
`professional` فلا يتعطَّل أي سيناريو Milestone سابق.

**قاعدة البيانات**: migration واحدة
(`20260817010000_milestone8_saas_subscription`) — جدولان جديدان
(`plans` بلا RLS، `subscriptions` بـ RLS FORCE + `tenant_isolation`)،
فهارس على `status` و`plan_id`، لا حذف بيانات، لا drift. أي منشأة سابقة
لهذا الـMilestone بلا سطر اشتراك تحصل عليه بشكل كسول (lazy) عند أول طلب
مصادَق بعد النشر — ضمن معاملة tenant-scoped فعلية، وليس عبر backfill
مباشر في الـmigration (راجع `docs/DOMAIN_MODEL.md` "SaaS / Subscription"
"لماذا لا Backfill في الـmigration").

**الواجهة الأمامية**: صفحة جديدة `SubscriptionPage.tsx`
(`/subscription`) — الخطة الحالية، حالة الاشتراك، الأيام المتبقية من
التجربة، قائمة الميزات (✓/✕)، أشرطة استخدام (مستخدمون/فروع/مبيعات
شهرية)، كتالوج الخطط المتاحة، ورسالة صادقة بديلة عن أي دفع/checkout
("التواصل مع الدعم"). عنصر تنقّل جديد + شريط تنبيه عام في `Layout.tsx`
عند تقييد الاشتراك أو اقتراب انتهاء التجربة (≤3 أيام).

**الاختبارات**: `test/milestone8.e2e-spec.ts` (14 اختبارًا: اشتراك
افتراضي عند التسجيل، صلاحيات ميزات مبنية على الخطة رغم RBAC كاملة، حدود
استخدام تسلسلية ومتزامنة [مستخدمون/فروع/مبيعات]، دورة حياة التجربة
وانتهاؤها، إيقاف منشأة، عزل مستأجرين مباشر لجدول `subscriptions`)،
اختبار Vitest جديد (`SubscriptionPage.test.tsx`، 4 اختبارات)،
`golden-path.spec.ts` مُمدَّد (لا ملف جديد) بقسم اشتراك جديد.

### تصحيحات في التوثيق
`docs/PROJECT_STATUS.md`/`docs/DOMAIN_MODEL.md`/`docs/DATABASE.md`/
`docs/API.md`/`docs/SECURITY.md`/`docs/TESTING.md`/`docs/DEPLOYMENT.md`/
`docs/DEMO.md` — إزالة كل إشارة سابقة لـ"Subscription/Billing" كنطاق
مستقبلي/غير موجود، واستبدالها بالوصف الفعلي لما نُفِّذ في هذا
الـMilestone.

### قرارات مُتعمَّدة بلا تعقيد زائد
- **لا حالة `past_due`**: لا يوجد تكامل تحصيل دفع خارجي في هذا
  الـMilestone (قرار Section 16 صريح)، فلا حدث حقيقي يُنتج انتقالًا
  لحالة "فشل الدفع" — إضافتها كانت ستكون Enum زخرفيًا بلا سلوك حقيقي.
  حالة `expired` (انتهاء تجربة) تُغطّي السلوك المطلوب من "قيد تدريجي
  قابل للاستعادة" بدلًا منها.
- **لا جدول `UsageCounter` منفصل**: الموارد الثلاثة المحدودة (مستخدمون/
  فروع/مبيعات شهرية) قليلة العدد لكل منشأة ومُشتقَّة رخيصًا بـ
  `COUNT(*)` تحت قفل صف حقيقي — تخزين عدّاد منفصل كان سيكون Denormalization
  بلا مبرر أداء واضح (Section 18).
- **لا Backfill مباشر في الـmigration للمنشآت القديمة**: `subscriptions`
  يحمل RLS FORCE، والدور الذي يُشغِّل الـmigrations/الـseed ليس Superuser
  ولا BYPASSRLS — أي `INSERT ... SELECT FROM companies` عابر للمستأجرين
  كان سيُمنَع صامتًا بواسطة RLS نفسه. الحل: إنشاء كسول داخل معاملة
  tenant-scoped صحيحة عند أول طلب (نفس آلية اكتشاف انتهاء التجربة).

### Tests
Backend: **209/209** (195 + 14 جديدة). Frontend: **47/47** (43 + 4
جديدة). Playwright: **4/4** (نفس العدد، `golden-path.spec.ts` مُمدَّد).
كلها أُعيد تشغيلها فعليًا في هذه الدورة ضد قاعدتي بيانات حقيقيتين (dev
وtest).

### Push
NOT PUSHED

## [Milestone 7: Merchant Operations & Business Completion] - 2026-08-17

يُغلق فجوات مُوثَّقة صراحة منذ Milestone 1/5/6 تحت "مؤجَّل": بيع آجل
حقيقي (AR)، دفعة لمورد (AP)، مرتجعات مبيعات/مشتريات جزئية، ترحيل محاسبي
لتسويات/جرد المخزون، وتسوية بنكية/نقدية أساسية. كل ميزة عبر نفس نقطة
العبور الوحيدة `JournalService.postJournalEntry`، بلا إعادة بناء أي بنية
تحتية موجودة، وبنفس أنماط التزامن (`SELECT ... FOR UPDATE`) وIdempotency
(`clientReferenceId`) المُستخدَمة في كل مرحلة سابقة.

### أُضيف

**محاسبة**:
- بيع آجل/جزئي الدفع: `CreateSaleDto.payments` قد يكون مجموعه أقل من
  الإجمالي أو فارغًا (يتطلب `customerId`) — الفرق يُرحَّل `Dr` على ذمم
  مدينة `1100` ضمن نفس قيد البيع.
- `SalesService.recordPayment` (`POST /sales/:id/payments`) — تسوية ذمم
  مدينة، `Dr Cash/Bank / Cr AR`، منع دفع زائد بقفل صف حقيقي.
- `PurchasesService.recordPayment` (`POST /purchases/:id/payments`) —
  نموذج `SupplierPayment` جديد، تسوية ذمم دائنة، `Dr AP / Cr Cash/Bank`.
- `SalesReturnService` (`POST /sales/:id/returns`) — نموذجا `SaleReturn`/
  `SaleReturnItem` جديدان، مرتجعات جزئية/كلية/متعددة بالتكلفة التاريخية،
  سياسة استرداد "الذمم أولًا".
- `PurchaseReturnService` (`POST /purchases/:id/returns`) — نموذجا
  `PurchaseReturn`/`PurchaseReturnItem` جديدان، بلا تعديل على أمر الشراء
  الأصلي.
- ترحيل محاسبي لتسويات المخزون (`InventoryService.adjustStock`) وإكمال
  الجرد (`StockCountService.complete`) — حسابان جديدان (`4030` أرباح
  تسوية، `5011` مصروف تسوية)، آلية `recordMovementWithValueDelta` لحساب
  فرق القيمة الدقيق دون تعديل SQL الحركة المُثبَتة، وفصل ربح/خسارة
  إجماليَين في قيد الجرد بلا تقاصّ.
- `BankReconciliationService` (`/accounting/reconciliations`) — تسجيل
  أدنى (رصيد دفتري مُشتقّ من القيود + رصيد كشف حساب يدوي + فرق)، بلا
  مطابقة أسطر فردية وبلا اتصال بأي بنك خارجي.
- 3 حسابات جديدة في دليل الحسابات (`4020` مرتجعات مبيعات، `4030` أرباح
  تسوية مخزون، `5011` مصروف تسوية مخزون) — تُزرَع تلقائيًا للمنشآت
  الجديدة، وBackfill idempotent للمنشآت الموجودة ضمن نفس الـmigration.

**RBAC**: 5 صلاحيات جديدة (`sales.payment.record`, `sales.return`,
`purchases.payment.record`, `purchases.return`,
`accounting.reconciliation.manage`) بتوزيع مبني على فصل المهام.

**قاعدة البيانات**: migration واحدة
(`20260817000000_milestone7_merchant_operations`) — 6 جداول جديدة
(`supplier_payments, sale_returns, sale_return_items, purchase_returns,
purchase_return_items, bank_reconciliations`، كلها RLS FORCE +
`tenant_isolation`)، عمود واحد جديد (`payments.client_reference_id`)، لا
حذف بيانات، لا drift.

**الواجهة الأمامية**: نموذجا دفعة/مرتجع ضمن تفاصيل الفاتورة
(`InvoicesPage.tsx`) وأمر الشراء (`PurchasesPage.tsx`)، تبويب "التسوية
البنكية/النقدية" جديد في `AccountingPage.tsx`، دعم بيع آجل/جزئي في
`PosPage.tsx` (كان يفرض تطابق الدفعات مع الإجمالي بالضبط).

**الاختبارات**: `test/milestone7.e2e-spec.ts` (34 اختبارًا، منها اختبار
تكامل مالي شامل واحد واختبار RLS مباشر لكل الجداول الستة الجديدة معًا)،
3 ملفات Vitest جديدة/مُمتَدة (+9 اختبارات)، `golden-path.spec.ts` مُمدَّد
(لا ملف جديد) بستة أقسام جديدة نُفِّذت فعليًا عبر متصفح حقيقي ضد Backend
حقيقي.

### تصحيحات في التوثيق
`docs/ACCOUNTING.md`/`docs/API.md`/`docs/DATABASE.md`/
`docs/DOMAIN_MODEL.md`/`docs/SECURITY.md`/`docs/TESTING.md` — إزالة
ادّعاءات كانت صحيحة قبل هذا الـMilestone وأصبحت قديمة (AR فارغ هيكليًا،
AP لا يتناقص، لا مرتجعات جزئية، لا ترحيل محاسبي للتسويات/الجرد).

### قرار مُتعمَّد بلا تغيير كود
إجراء إقفال فترة محاسبي فعلي (Period-Closing Entry) — أُعيد فحص
`FiscalPeriodsService`/`JournalService` بالكامل، لم يُوجَد عيب حقيقي في
التصميم الحالي (قفل يمنع ترحيل جديد + بند "أرباح غير مقفلة" محسوب في
الميزانية) يستوجب تغييرًا، ولا قرار عمل واضح لبناء إجراء إقفال فعلي
بدليل من النموذج الحالي — راجع `docs/ACCOUNTING.md` "الفترات المحاسبية —
لا تغيير".

### Tests
Backend: **195/195** (161 + 34 جديدة). Frontend: **43/43** (34 + 9
جديدة). Playwright: **4/4** (نفس العدد، `golden-path.spec.ts` مُمدَّد).
كلها أُعيد تشغيلها فعليًا في هذه الدورة.

### Push
NOT PUSHED

## [Final Completion & Release Candidate] - 2026-08-17

تدقيق نهائي شامل للمنتج بأكمله كما هو اليوم — **لا كود جديد، لا ميزة
جديدة، لا مرحلة جديدة**. مراجعة قراءة فقط (git status/log، بنية
backend/frontend، schema/migrations، auth/RLS/RBAC، inventory/sales/
purchases/accounting/reports، Excel Import، ZATCA Phase 1، Docker/CI/
health/logging/env validation، demo seed) ثم إعادة تشغيل فعلية لكل
مجموعة التحقق (لا نقل عن تقرير سابق): backend lint/typecheck/build/e2e
(**161/161**)، frontend lint/build/Vitest (**34/34**)، Playwright الكامل
(**4/4** — الأسرة الذهبية + ZATCA QR + استيراد Excel + عزل مستأجرين، كل
واحد نُفِّذ فعليًا ضد Backend حقيقي عبر متصفح حقيقي)، `prisma migrate
status` على dev وtest (لا drift)، وفحص أسرار شامل على كامل المستودع (لا
تسريب). لم يُوجَد أي عائق حقيقي (Real Blocker) — لا ثغرة أمنية، لا خلل
في عزل المستأجرين، لا خطأ محاسبي/COGS/مخزون، لا فشل بناء أو اختبار.

### التصنيف النهائي
**RELEASE CANDIDATE — READY**. التفصيل الكامل في `docs/PROJECT_STATUS.md`
"Final Release Candidate".

### أُضيف
- تصنيف رسمي RELEASE CANDIDATE في `docs/PROJECT_STATUS.md` (قسم "Final
  Release Candidate" كامل: النطاق المُتحقَّق، الأسرة الذهبية، السلامة
  المالية، عزل المستأجرين، الأمان، الاختبارات، القيود المعروفة، النطاق
  المستقبلي/الخارجي).

### لم يتغيّر
لا سطر كود واحد في `backend/` أو `frontend/` تغيّر في هذه الدورة —
التغيير الوحيد توثيقي.

## [Milestone 6: Weighted-Average Inventory Valuation & COGS] - 2026-08-16

حسم قرار COGS/تقييم المخزون المُؤجَّل صراحة منذ Milestone 1/5. القرار:
**Weighted Average (متوسط مرجّح متحرك)** — بعد مراجعة الكود الفعلي
(`StockLevel` صف واحد لكل Product×Warehouse، لا مفهوم Lot في المخطط
بأكمله)، وليس FIFO الذي كان سيتطلب طبقة Cost Lot/Layer جديدة كاملة.

### أُضيف

- **Schema**: `stock_levels.average_cost` (Decimal(14,4)، افتراضي 0)،
  `sale_items.unit_cost` (Decimal(14,4)?، NULL للبيانات القديمة).
  Migration واحدة (`20260816150000_milestone6_weighted_average_cogs`).
- **`InventoryValuationService`** (جديد،
  `backend/src/modules/inventory/inventory-valuation.service.ts`) —
  المصدر الوحيد لحساب COGS، يُستخدَم من Sales/Purchases/Inventory/
  StockCount.
- **`InventoryService.recordMovement` مُمدَّدة**: نفس الـUPDATE الذرّي
  المحروس الذي يكتب `quantity_on_hand` منذ Phase 2 يكتب الآن
  `average_cost` أيضًا، بصيغة `CASE`/`COALESCE` كاملة داخل SQL واحد —
  لا كتابة منفصلة، لا فجوة تزامن جديدة.
- **`Dr COGS(5010) / Cr Inventory(1200)`** على كل بيع
  (`SalesService.createSale`) — القيمة مُشتقّة حصرًا من محرّك التقييم،
  لا مسار يقبلها من العميل (`SaleItemInputDto` لا يحمل حقل تكلفة أصلًا).
  الحساب `5010` كان مزروعًا منذ Phase 4 ومعلَّقًا "Reserved, unused" —
  أصبح مُستخدَمًا الآن.
- **مرتجعات (`cancelSale`)**: تُعيد المخزون بتكلفة البيع الأصلية
  (`SaleItem.unitCost` المُخزَّن وقت البيع)، لا بالمتوسط الحالي.
- حقلا `unitCost` اختياريان جديدان على `SetOpeningBalanceDto` و
  `AdjustStockDto` (fallback موثَّق إلى `Product.costPrice`/المتوسط
  الحالي إن حُذفا).
- حقلا `costOfGoodsSold`/`grossProfit` جديدان في استجابة `GET
  /accounting/reports/profit-and-loss` (إضافة متوافقة خلفيًا).
- واجهة أمامية: عمودا متوسط التكلفة/قيمة المخزون في `InventoryPage.tsx`،
  حقل تكلفة اختياري في نموذجَي الرصيد الافتتاحي/التسوية، عرض COGS/Gross
  Profit في تبويب P&L بـ`ReportsPage.tsx`.
- اختبارات: 22 اختبار e2e جديد (`milestone6.e2e-spec.ts`، يشمل اختبارَي
  تزامن حقيقيَّين ومثالًا محسوبًا كاملًا مُتحقَّقًا رقميًا)، 4 اختبارات
  Vitest جديدة (`InventoryPage.test.tsx`) + تمديد `ReportsPage.test.tsx`،
  و`golden-path.spec.ts` Playwright مُمدَّد.

### قرارات معمارية مسجَّلة

- **Weighted Average لا FIFO** — الأنسب لشكل `StockLevel` الحالي بأقل
  تغيير، مُبرَّر بمراجعة الكود لا افتراضًا.
- **لا ترحيل محاسبي للتسويات/الجرد** — قرار متعمَّد وموثَّق، ليس نسيانًا؛
  ربطها بالمحاسبة قرار عمل منفصل لم يُطلَب حسمه هنا.
- **لا تخمين لتكلفة تاريخية** — `SaleItem.unitCost` يبقى NULL لأي سطر
  بيع سابق لهذه المرحلة، بلا Migration بيانات اختراعية.

### Tests

**161/161** خلفية (139 سابقة + 22 جديدة، صفر تراجع؛ اختباران في
`milestone1`/`phase4` عُدِّلا ليعكسا سلوك COGS الجديد الصحيح) + **34/34**
Vitest (30 + 4 جديدة) + Playwright **4/4** — كلها مُتحقَّقة فعليًا
بالتشغيل. Docker: BLOCKED BY ENVIRONMENT (daemon غير متاح).

## [Milestone 5: Accounting Completion Verification] - 2026-08-16

طلب هذا الـMilestone بناء Trial Balance/General Ledger/P&L/Balance Sheet/
AR/AP Subledger/Fiscal Periods/Accounting Opening Balances، مع تعليمة
صريحة بمراجعة الكود الفعلي أولًا. **المراجعة المعمارية أثبتت أن هذا
النطاق بالكامل كان مُنفَّذًا ومُختبرًا مسبقًا** ضمن "Milestone 1: Accounting
Completion" (نفس الجلسة، تسمية مختلفة، commit `2871835`) — لم يُعَد بناء
أي جزء منه. العمل الفعلي هنا: إغلاق فجوات **اختبار** حقيقية فقط عثر عليها
الاستعراض.

### أُضيف

- `frontend/src/pages/__tests__/ReportsPage.test.tsx` (جديد، 7 اختبارات):
  بوابة صلاحية `accounting.reports.view`، تحميل/خطأ/فراغ لكل من ميزان
  المراجعة/دفتر الأستاذ/الأرباح والخسائر/الميزانية العمومية، والتبديل بين
  التبويبات يُطلق طلب API صحيحًا.
- `frontend/src/pages/__tests__/ReceivablesPayablesPage.test.tsx` (جديد، 5
  اختبارات): تركيبات صلاحية AR/AP، نص الفجوة الهيكلية لـAR (لا بيع آجل)،
  فتح كشف حساب مورد.
- `frontend/src/pages/__tests__/AccountingPage.test.tsx` (جديد، 7
  اختبارات): تبويبَي الأرصدة الافتتاحية والفترات المحاسبية — الحالة
  الفارغة، إخفاء أزرار الإدارة بلا `accounting.opening_balance.manage`/
  `accounting.period.manage`، وإقفال فترة فعليًا.
- تحقق `AuditLog` صريح (`tx.auditLog.findFirst`) لـ
  `accounting.period.close` و`accounting.opening_balance.create` داخل
  اختبارين موجودَين في `test/milestone1.e2e-spec.ts` — لم يكونا يتحققان
  من دخول سجل Audit فعلي سابقًا.
- `frontend/e2e/golden-path.spec.ts` مُمدَّد (لا ملف جديد): يزور الآن فعليًا
  دفتر الأستاذ/الأرباح والخسائر/الميزانية العمومية/تبويب AR، وينشئ فترة
  محاسبية حقيقية عبر `/accounting`.

لا Model/Migration/Endpoint/صفحة واجهة أمامية/صلاحية RBAC جديدة — كل ذلك
كان كاملًا مسبقًا.

### COGS / تقييم المخزون
لا يزال **DECISION REQUIRED** — لم يُمَس في هذا الـMilestone، تمامًا كما لم
يُمَس في Milestone 1. راجع `docs/ACCOUNTING.md` "مؤجَّل".

### Tests

**139/139** خلفية (بدون تغيير في العدد — تحققان إضافيان داخل اختبارين
موجودَين) + **30/30** Vitest (11 سابقة + 19 جديدة عبر 3 ملفات جديدة) +
Playwright **4/4** (بدون ملف جديد، `golden-path.spec.ts` مُمدَّد) — كلها
مُتحقَّقة فعليًا بالتشغيل ضد Postgres حقيقي وBackend حقيقي.

## [Milestone 4: ZATCA E-Invoicing Readiness] - 2026-08-16

جعل qeedha B جاهزًا معماريًا وفنيًا لمتطلبات ZATCA بدون اختراع أي متطلب
قانوني/تقني غير مؤكَّد. **المُنفَّذ**: توليد رمز QR محلي (Phase 1 فقط)
معزول تمامًا عن منطق البيع/الفواتير الأساسي. **غير المُنفَّذ، Blocked
صراحة**: كل ما يحتاج اعتمادات/عقد ZATCA حقيقيَين (Phase 2 بالكامل).

### أُضيف

- **`TlvQrService`**
  (`backend/src/modules/einvoice/tlv-qr.service.ts`) — ترميز TLV
  (Tag-Length-Value، بايت-بايت، طول القيمة بالبايت الحقيقي لـUTF-8) +
  Base64 للحقول الخمسة المنشورة في مواصفة ZATCA Phase 1 (اسم البائع،
  الرقم الضريبي، الطابع الزمني، إجمالي الفاتورة، إجمالي الضريبة).
  التحقق من المواصفة تم عبر مصادر تقنية ثانوية متعددة مستقلة (الوصول
  المباشر لملف zatca.gov.sa الرسمي كان محظورًا بواسطة Egress Proxy بيئة
  التطوير) — موثَّق بصراحة في `docs/ZATCA.md`.
- **`EInvoiceService`**
  (`backend/src/modules/einvoice/einvoice.service.ts`) — الطبقة الوحيدة
  التي تعرف تفاصيل ZATCA؛ تُستدعى من `SalesService.createSale` باستدعاء
  واحد فقط بعد إنشاء الفاتورة. لا تُنشئ رمز QR إن لم تملك المنشأة رقمًا
  ضريبيًا مسجَّلًا (بدل توليد رمز ناقص يوهم بامتثال غير حقيقي).
- **`ZatcaProvider` (port، غير مُنفَّذ)**
  (`backend/src/modules/einvoice/ports/zatca-provider.port.ts`) — نقطة
  توسّع موثَّقة لـPhase 2، غير مسجَّلة في أي مكان، بنفس مبدأ
  `IntegrationRegistry` قبل وجود أي Payment adapter فعلي.
- **`invoice_compliance` (جدول جديد، RLS كاملة)**: 1:1 مع `Invoice`،
  منفصل تمامًا عنه (`EInvoiceStatus.not_submitted` هي القيمة الوحيدة
  المُستخدَمة فعليًا؛ باقي القيم محجوزة لـPhase 2 غير المُستخدَم).
- **واجهة أمامية**: زر "عرض QR" في صفحة المبيعات/الفواتير (يظهر فقط
  للفواتير التي تملك رمزًا فعليًا)، نافذة تعرض صورة QR حقيقية (مكتبة
  `qrcode`) مع تنويه "مُولَّد محليًا، لم يُرسَل بعد لأي واجهة برمجية
  خارجية". حقل "الرقم الضريبي (اختياري)" أُضيف لنموذج التسجيل — بدونه
  كانت الميزة ستبقى غير قابلة للوصول من أي مستخدم حقيقي.
- **اختبارات**: 5 اختبارات e2e (`einvoice.e2e-spec.ts`، تشمل فك ترميز
  TLV فعلي والتحقق من مطابقة القيم لبيانات الفاتورة الحقيقية) + 4
  اختبارات Unit (`tlv-qr.service.spec.ts`، أول ملف Unit test في
  الـBackend — يشمل اختبار صريح لاسم بائع عربي متعدد البايت) + 2 اختبار
  Vitest + مجموعة Playwright جديدة (`einvoice-qr.spec.ts`).
- توثيق: `docs/ZATCA.md` (أُعيدت كتابته بالكامل من تصميم مرجعي إلى
  توثيق حالة تنفيذ حقيقية: Implemented/Not Implemented/Blocked)،
  `docs/DATABASE.md`، `docs/DOMAIN_MODEL.md`، `docs/MODULES.md`،
  `docs/API.md`، `docs/SECURITY.md`، `docs/TESTING.md`،
  `docs/PROJECT_STATUS.md`.

### قرارات معمارية مسجَّلة

- **جدول منفصل (`invoice_compliance`) لا أعمدة على `Invoice`** — يبقي
  سجل الأعمال الداخلي بلا تلوّث بتفاصيل امتثال خارجي.
- **كل فاتورة "مبسّطة" (B2C)، لا عمود `invoiceType`** — كل فاتورة تُصدَر
  حصرًا من POS، قرار مبني على واقع نطاق المنتج الحالي.
- **لا hash/CSID/signing metadata أُضيف للمخطط** — تُرِكت هذه الأعمدة
  حتى حسم نطاق سلسلة Previous Invoice Hash وتوفر عقد ZATCA الفعلي.
- **`CertificateProvider`/`SecretProvider` لم يُبنَيا** — لا استخدام
  فعلي بعد يبرر بناءهما.

### Tests

**139/139** خلفية (134 سابقة + 5 جديدة، صفر تراجع) + **4/4** Unit جديدة
+ **11/11** Vitest (9 + 2 جديدة) + Playwright **4/4** (3 + 1 جديدة) —
كلها مُتحقَّقة فعليًا بالتشغيل.

## [Milestone 3: Excel Import] - 2026-08-16

نظام استيراد بيانات جماعي حقيقي من ملفات Excel (.xlsx)، مبني بالكامل فوق
الخدمات الموجودة أصلًا (`ProductsService`، `CatalogService`،
`CustomersService`، `SuppliersService`،
`InventoryService.setOpeningBalance`) — بلا منطق أعمال موازٍ جديد، وبلا
تغيير على أي جدول موجود سوى جدول جديد واحد (`import_jobs`).

### أُضيف

- **File Storage abstraction**: `backend/src/modules/storage` —
  `FileStorageProvider` interface + `LocalFileStorageProvider` (المُنفَّذ
  الوحيد، مُتحقَّق منه بالتشغيل) + `StorageService`. مزوّد S3-compatible
  **مصمَّم له، غير مُنفَّذ** (لا اعتمادات حقيقية لاختباره بصدق). مفاتيح
  التخزين مولَّدة من الخادم دائمًا (`imports/<companyId>/<jobId>/source.xlsx`)
  — Path traversal غير ممكن بنيويًا.
- **`ImportJob` (جدول جديد، RLS كامل)**: `backend/src/modules/imports` —
  حالات `uploaded → analyzing → ready → validating → validated →
  importing → completed`/`failed`/`cancelled`. 7 أنواع بيانات: منتجات،
  باركود، تصنيفات، وحدات، عملاء، موردون، رصيد افتتاحي للمخزون.
- **التدفق الكامل**: Upload (تحقق بصمة ZIP حقيقية + حد حجم 5MB) → Detect
  (اقتراح ربط أعمدة تلقائي) → Map (`PATCH .../mapping`) → Preview (بلا أي
  كتابة، مُختبَر e2e) → Validate (تحقق شامل: حقول مطلوبة، تكرار داخل
  الملف ومقابل البيانات الموجودة، مراجع تصنيف/علامة/وحدة، حد أقصى 5000
  صف) → Confirm (الكتابة الفعلية الوحيدة، كل صف بمعاملة منفصلة فلا
  يُفسِد فشل صف واحد البقية) → Audit (كل خطوة حسّاسة مُدقَّقة).
- **Idempotency**: `clientReferenceId` عند الرفع (نفس نمط
  Sale/Purchase/Expense) + `confirm` مؤمَّن على مستوى المهمة (استدعاؤه
  مرتين لا يستورد الصفوف مرتين) — كلاهما مُختبَر e2e.
- **RBAC**: صلاحيتان جديدتان فقط (`import.read`/`import.create`) في نظام
  RBAC الموجود أصلًا.
- **أمان**: بصمة ملف حقيقية، حد حجم/صفوف صريح، حماية Formula/CSV
  injection (`sanitizeImportedText`)، لا Endpoint لتنزيل ملف خام، عزل
  مستأجرين + IDOR (404 على مهمة منشأة أخرى، مُختبَر e2e)، نطاق
  الفروع/المستودعات لاستيراد الرصيد الافتتاحي (مُختبَر e2e).
- **واجهة أمامية**: `frontend/src/pages/ImportPage.tsx` (`/import`) —
  صفحة واحدة تتبع حالة `ImportJob` الحقيقية، لا بيانات وهمية، RBAC
  gating، Loading/Error/Success لكل خطوة، متوافقة مع RTL والتصميم
  المتجاوب من Milestone 2.
- **اختبارات**: 22 اختبار e2e خلفي جديد (`imports.e2e-spec.ts`)، اختباران
  Vitest جديدان (`ImportPage.test.tsx`)، ومجموعة Playwright جديدة
  (`excel-import.spec.ts`، بملف `.xlsx` حقيقي مُلتزَم بالمستودع
  `frontend/e2e/fixtures/import-products.xlsx`) — كلها نُفِّذت فعليًا
  ونجحت.
- توثيق جديد/مُحدَّث: `docs/IMPORT_EXCEL.md` (أُعيدت كتابته بالكامل من
  تصميم مرجعي إلى توثيق التنفيذ الفعلي)، `docs/DATABASE.md`،
  `docs/DOMAIN_MODEL.md`، `docs/MODULES.md`، `docs/SECURITY.md`،
  `docs/TESTING.md`، `docs/API.md`، `docs/PROJECT_STATUS.md`.

### قرارات معمارية مسجَّلة

- **لا جدول `import_job_rows` منفصل** — نتيجة كل صف تُعاد حسابها من
  الملف المخزَّن عند كل خطوة، لا صف قاعدة بيانات مستقل لكل سطر Excel.
- **لا تحديث سجل موجود عبر الاستيراد** — إنشاء فقط؛ SKU/مرجع مكرر يُرفَض
  كخطأ، لا يُحدِّث السجل القائم (تبسيط متعمَّد يتجنّب مخاطر Overwrite).
- **مراجع الأسماء لا تُنشَأ تلقائيًا** إن لم توجد — تُرفَض كخطأ.
- **لا Queue/معالجة خلفية** — الملفات صغيرة بما يكفي (5MB/5000 صف) لتُعالَج
  ضمن دورة الطلب/الاستجابة نفسها.

### Tests

**134/134** خلفية (112 سابقة + 22 جديدة، صفر تراجع) + **9/9** Vitest (7 +
2 جديدة) + Playwright **3/3** — كلها مُتحقَّقة فعليًا بالتشغيل.

## [Milestone 2: Production Hardening + Demo/Staging Readiness] - 2026-08-15

لا منطق أعمال جديد ولا تغيير على المخطط — تصليب تشغيلي/أمني للنظام
الموجود وتجهيز Demo/Staging: CORS مبني على البيئة (fail-closed في
production)، فحص صحة (health check) يُرجع `503` عند فشل قاعدة البيانات،
Logging مهيكل بلا أي سرّ، إصلاح فجوات أداء (ترقيم `iam.listUsers`، حد
أقصى لدفتر الأستاذ/كشوف الحسابات)، Docker (backend + frontend + root
compose)، CI (GitHub Actions، جاهز وغير مُشغَّل فعليًا على runner حقيقي)،
سكربت بذر بيانات تجريبية، وإصلاحات RBAC/حالات تحميل-خطأ/استجابة/جلسة
منتهية في الواجهة الأمامية + أول اختبارات آلية (Vitest) ومجموعة
Playwright مُلتزَمة.

### أُضيف
- **CORS مبني على البيئة**: `src/config/cors.config.ts`
  (`buildCorsOptions`, `assertCorsConfiguredForProduction`) — متغيّر بيئة
  `CORS_ALLOWED_ORIGINS` (قائمة صريحة، لا `"*"` أبدًا). إلزامي في
  production (رفض إقلاع صريح بدونه)، افتراضي لمنافذ Vite المحلية في
  development/test. يستبدل `app.enableCors()` بلا خيارات (كان يقبل/يعكس
  أي origin). راجع `docs/SECURITY.md` "CORS".
- **Health check مُوسَّع**: `HealthController` يُرجع الآن
  `{status, timestamp, checks: {app, database}}` ويُرجع **`503`** (لا
  `200`) عند فشل فحص قاعدة البيانات، بحيث فحوص الحاوية/المنسّق التي
  تعتمد على status code فقط تعمل بشكل صحيح.
- **Logging مهيكل**: `RequestIdMiddleware` (معرّف ارتباط لكل طلب، يعيد
  استخدام `x-request-id` الوارد أو يولّد UUID جديد) +
  `LoggingInterceptor` (سطر JSON واحد لكل طلب: `requestId`, `method`,
  `path`, `status`, `durationMs`) — لا رؤوس/معاملات استعلام/جسم طلب أو
  استجابة تصل إليه أبدًا، فلا سرّ يصل إلى Log عن طريق الخطأ.
- **إصلاحات أداء (بتدقيق مخصص)**: `IamService.listUsers` (`GET
  /iam/users`) كان `findMany` بلا حد أعلى — أصبح مُرقَّمًا (`QueryUsersDto`
  الجديد)، صيغة الاستجابة تغيّرت من مصفوفة مسطّحة إلى `{data, meta}`
  القياسية. دفتر الأستاذ العام (`AccountingReportsService`) وكشوف حساب
  العميل/المورد (`SubledgerService`) كانا بلا حد أعلى — الآن بحد أقصى
  1000 سطر (`MAX_LEDGER_LINES`/`MAX_STATEMENT_LINES`، حد وليس Pagination
  كاملة — تضييق مدى التاريخ هو الطريقة المقصودة لرؤية أكثر). باقي نقاط
  القائمة في النظام كانت مُرقَّمة أصلًا بالفعل — تأكيد لا إصلاح.
- **Docker**: `backend/Dockerfile` (multi-stage: deps → build →
  prod-deps → runtime، `node:20-slim` عمدًا بدل alpine — بنيات argon2/
  Prisma engine الجاهزة أوثق على glibc)، `backend/.dockerignore`،
  `frontend/Dockerfile` (multi-stage: بناء Vite بـ`VITE_API_BASE_URL`
  مُضمَّن وقت البناء، ثم nginx لخدمة الملفات الثابتة)،
  `frontend/nginx.conf` (SPA fallback routing). Migrations **لا** تُشغَّل
  تلقائيًا عند بدء الحاوية — خطوة منفصلة صريحة دائمًا.
- **`docker-compose.yml` (جذر المستودع، جديد)**: تنسيق ثلاث خدمات منفصلة
  (`postgres`, `backend`, `frontend`) — Postgres لا يُدمَج أبدًا داخل
  صورة التطبيق. يتطلب `.env` جذري جديد (`POSTGRES_PASSWORD`) منفصل عن
  `backend/.env` (غير مُتزامنَين تلقائيًا — راجع `docs/DEPLOYMENT.md`).
- **CI**: `.github/workflows/ci.yml` (جديد) — ثلاث jobs (`backend`,
  `frontend`, `e2e`) تغطي lint/typecheck/build/tests الخلفية والأمامية
  بالإضافة لمجموعة Playwright كاملة ضد الحزمة الحقيقية.
- **سكربت بذر بيانات تجريبية**: `backend/scripts/demo-seed.ts` (سكربت
  `npm run demo:seed` الجديد) — يُنشئ منشأة تجريبية واحدة عبر
  Endpoints الحقيقية (لا إدخال DB مباشر): 4 منتجات، 2 عميل، 2 مورد، شراء
  واحد مُستلَم، بيع POS واحد مكتمل. كل اسم مُعلَّم صراحة "(Demo)" وكل بريد
  `@qeedha-demo.local` — لا بيانات شخصية حقيقية. **نُفِّذ فعليًا ضد
  backend حقيقي خلال هذه الجلسة ونجح.** راجع `docs/DEMO.md`.
- **إصلاحات RBAC/تحميل-خطأ في الواجهة الأمامية**: `DashboardPage.tsx`
  لم تكن مُقيَّدة بأي صلاحية وتجلب عبر `Promise.all` (فشل واحد يُفرغ
  اللوحة) — أصبحت كل بطاقة مُقيَّدة بصلاحيتها وتُجلَب عبر
  `Promise.allSettled`. `InvoicesPage.tsx` لم تكن تتحقق من `hasPermission`
  إطلاقًا — أصبحت مُقيَّدة بـ`invoices.read`. 9+ صفحات أخرى أُضيف لها
  زوج حالة تحميل/خطأ لجلب البدء (كان مقتصرًا على أزرار الإنشاء/التعديل/
  الحذف فقط سابقًا). راجع `docs/TESTING.md` للقائمة الكاملة.
- **معالجة انتهاء الجلسة (401)**: `SESSION_EXPIRED_EVENT`
  (`frontend/src/api/client.ts`) يُطلَق عند فشل تجديد التوكن؛
  `AuthProvider` يستمع له ويُفرغ `me` فيعيد التوجيه لـ`/login` بدل شاشة
  مُصادَق عليها باليات.
- **استجابة (Responsive)**: `Layout.tsx` أُعيدت كتابته — الشريط الجانبي
  أصبح درج off-canvas تحت `md` (زر همبرغر في شريط علوي)، بلا تغيير فوق
  `md`. نحو 20 جدول بيانات عبر التطبيق (Products, Inventory, Customers/
  Suppliers, Purchases×2, Expenses, Accounting×5, Reports×5,
  Receivables/Payables×2, POS, Invoices) لُفَّت بـ`overflow-x-auto` —
  تمرير أفقي بدل كسر تخطيط الصفحة، بلا إعادة تصميم.
- **Onboarding**: `OnboardingChecklist.tsx` (جديد) — قائمة من 8 خطوات
  على لوحة التحكم (منشأة/فرع/مستودع تظهر مكتملة دائمًا لأن
  `registerCompany` تُنشئها ذرّيًا؛ منتج/مخزون/عميل/مورد/أول بيع تُتحقَّق
  عبر الـAPI الحقيقي)، مُقيَّدة بصلاحية كل خطوة، قابلة للإخفاء (تُحفظ في
  localStorage)، تختفي تلقائيًا عند اكتمال كل خطوة ظاهرة. ليست معالج
  متعدد الشاشات — نطاق مُصغَّر عمدًا.
- **أول اختبارات آلية للواجهة الأمامية (Vitest)**: `vite.config.ts`
  (قسم `test`)، `src/test/setup.ts`، وثلاثة ملفات تحت
  `src/pages/__tests__/` (`LoginPage.test.tsx`, `RegisterPage.test.tsx`,
  `DashboardPage.test.tsx`) — **7 اختبارات، 7/7 ناجحة**، مُتحقَّق فعليًا.
  سكربتا `test`/`test:watch` جديدان.
- **مجموعة Playwright مُلتزَمة**: `playwright.config.ts`, `e2e/helpers.ts`,
  `e2e/golden-path.spec.ts` (الرحلة الكاملة تسجيل→...→تقارير→ذمم→خروج/
  دخول)، `e2e/tenant-isolation.spec.ts` (عزل منشأتين عبر الواجهة
  الحقيقية) — تستبدل السكربتات المؤقتة (scratchpad) اليدوية غير
  المُلتزَمة من المراحل السابقة. سكربت `test:e2e` جديد. **نُفِّذت فعليًا
  ضد الحزمة الحقيقية ونجحت (2/2)**.
- توثيق جديد: `docs/DEPLOYMENT.md`, `docs/DEMO.md`؛ توثيق مُحدَّث:
  `SECURITY.md`, `API.md`, `TESTING.md`, `PROJECT_STATUS.md`,
  `MODULES.md`, `DATABASE.md`, `DOMAIN_MODEL.md` (ملاحظة "لا تغييرات"
  في الأخيرين)، `backend/README.md`, `frontend/README.md`.

### قرارات معمارية مسجَّلة
- **`refresh_tokens` يبقى الاستثناء الوحيد من RLS**: راجَعنا صراحة إضافة
  RLS له في هذا الـMilestone وقررنا الإبقاء على الاستثناء الموثَّق —
  سبب معماري حقيقي (تناقض دائري "auth bootstrap" لـ`POST /auth/refresh`)
  وليس تكاسلًا. التفصيل الكامل في `docs/SECURITY.md`.
- **`node:20-slim` لا alpine** في كل Dockerfile عمدًا — argon2 (native
  module) وPrisma query engine أوثق على glibc.
- **Migrations لا تُشغَّل تلقائيًا عند بدء الحاوية** في أي مكان (Dockerfile
  ولا docker-compose) — خطوة منفصلة صريحة دائمًا، تمامًا كما في التطوير
  المحلي.
- **حد أقصى (1000 سطر) لا Pagination كاملة** لدفتر الأستاذ/كشوف
  الحسابات — تُقرَأ كعرض مستمر واحد، تضييق مدى التاريخ هو الطريقة
  المقصودة لرؤية أكثر، تمامًا كأي برنامج محاسبي حقيقي.
- **`403` لا يزال بلا واجهة مخصصة منفصلة** عن أي خطأ آخر — حد معروف
  موثَّق، وليس اكتمالًا مزعومًا.

### القيود المعروفة (موثَّقة صراحة، وليست ثغرات مسكوت عنها)
- **Docker لم يُبنَ فعليًا في هذه الجلسة**: بيئة التطوير هذه لا تملك
  daemon Docker يعمل (`dockerd` يفشل بـ"Operation not permitted") — كل
  Dockerfile وملف compose كُتبا بعناية باتّباع أنماط معروفة، لكن `docker
  build`/`docker compose up` لم يُنفَّذا أو يُتحقَّق منهما فعليًا.
- **CI لم يُشغَّل فعليًا على GitHub Actions runner حقيقي** — تحقُّق من
  صحة YAML النحوية فقط.
- **لا نشر Demo/Staging فعلي موجود** — لا حساب استضافة/اعتمادات كانت
  متاحة؛ كل ما هو موجود هو التهيئة الجاهزة (Dockerfiles، compose، CI)،
  وليس نشرًا فعليًا. راجع `docs/DEPLOYMENT.md` "القيود المعروفة".

### Tests
**112/112** (بلا تراجع — نفس عدد نهاية Milestone 1، لا منطق أعمال جديد؛
اختبار واحد فقط عُدِّل ليقرأ `res.body.data` بعد ترقيم `iam.listUsers`)
+ **7/7** Vitest جديدة + Playwright **2/2** (golden-path +
tenant-isolation) — كلها مُتحقَّقة فعليًا بالتشغيل، لا أرقام منسوخة.

## [Milestone 1: Accounting Completion] - 2026-08-15

طبقة قراءة/إدارة كاملة فوق أساس المرحلة 4 المحاسبي — 4 تقارير مالية
حية، Subledger ذمم مدينة/دائنة، أرصدة افتتاحية محاسبية، وفترات محاسبية
قابلة للإقفال — بلا أي تغيير على نقطة العبور الوحيدة لترحيل القيود
(`JournalService.postJournalEntry`/`reverseJournalEntry`).

### أُضيف
- `AccountingReportsService` + `AccountingReportsController`
  (`/accounting/reports/*`): ميزان مراجعة، دفتر أستاذ (برصيد افتتاحي
  محسوب صحيحًا عند تمرير `dateFrom`)، أرباح وخسائر، ميزانية عمومية —
  كلها تقرأ حيًا من `JournalLine`/`JournalEntry` المُرحَّلة، بلا أي رصيد
  إجمالي مُخزَّن منفصل، وتحترم نطاق الفرع (`accounting.reports.view`).
  الميزانية العمومية تضيف بند "أرباح مرحّلة غير مقفلة" **محسوب** (وسم
  `computed: true` صريح) لأن لا إجراء إقفال فترة فعلي يكنس صافي الدخل
  إلى Equity حقيقي بعد — حل عرض معياري في أدوات المحاسبة الصغيرة، وليس
  اختراعًا خاصًا بهذا النظام. راجع `docs/ACCOUNTING.md`.
- `SubledgerService` + `SubledgerController` (`/accounting/ar/customers`,
  `/accounting/ap/suppliers`): بنية عامة تقرأ من نفس دفتر الأستاذ.
  **AR يعود فارغًا هيكليًا اليوم دائمًا** (`accounting.ar.view`) — لا
  بيع آجل في هذا الكود على الإطلاق (`CreateSaleDto` يرفض أي بيع لا
  يساوي مجموع دفعاته الإجمالي بالضبط)، موثَّق صراحة كقيد وليس خطأ. AP
  (`accounting.ap.view`) مُعبَّأة فعليًا (كل استلام شراء يُرحّل لذمم
  دائنة) لكنها لا تتناقص — لا خطوة "دفع لمورد" بعد.
- `OpeningBalanceService` + `OpeningBalanceController`
  (`/accounting/opening-balance`، صلاحية `accounting
  .opening_balance.manage`): رصيد افتتاحي محاسبي — مختلف تمامًا عن
  الرصيد الافتتاحي للمخزون من المرحلة 2 — مُنفَّذ كـ`JournalEntry` عادي
  (`referenceType: 'OpeningBalance'`) عبر `JournalService
  .postJournalEntry` نفسها، لا جدول ولا آلية ترحيل موازية. حارس تزامن
  بفهرس فريد جزئي على `journal_entries`
  (`journal_entries_one_active_opening_balance`) يمنع أكثر من رصيد
  "نشط" واحد لكل منشأة حتى تحت سباق تزامن حقيقي، مُختبَر بطلبين
  متزامنين حقيقيين. عِلّة اكتُشفت وصُحِّحت: `JournalService
  .reverseJournalEntry` كان يُنشئ قيد العكس قبل تعليم الأصلي `reversed`،
  ما ينتهك هذا الفهرس عابرًا — صُحِّح بإعادة الترتيب.
- `FiscalPeriodsService` + `FiscalPeriodsController`
  (`/accounting/fiscal-periods`، جدول جديد `fiscal_periods` بـRLS FORCE
  كاملة، صلاحية `accounting.period.manage`): إنشاء/إقفال/إعادة فتح فترة
  محاسبية (رفض تقاطع الفترات بـ`409`، رفض مدى تاريخ غير منطقي بـ`400`).
  `JournalService.postJournalEntry`/`reverseJournalEntry` يستدعيان
  `assertTodayNotLocked` أول خطوة — يمنعان قيودًا **جديدة** فقط طالما
  اليوم يقع داخل فترة `closed` (لا Backdating في هذا النظام)، بلا أي
  أثر على قيد سابق مُرحَّل.
- 5 صلاحيات RBAC جديدة (`accounting.reports.view`, `accounting.ar.view`,
  `accounting.ap.view`, `accounting.opening_balance.manage`,
  `accounting.period.manage`) وتحديث الأدوار الافتراضية (Manager:
  تقارير+ذمم تشغيلية بلا الصلاحيتين الإداريتين؛ Accountant: الخمس
  كاملة؛ Cashier/Inventory Manager: بلا أي منها).
- واجهة أمامية: `/reports` (تبويبات التقارير الأربعة)،
  `/receivables-payables` (تبويبا AR/AP، مع نص Empty State يشرح فراغ AR
  البنيوي صراحة)، تبويبان جديدان ("الأرصدة الافتتاحية"، "الفترات
  المحاسبية") داخل `/accounting` الموجودة.
- `test/milestone1.e2e-spec.ts`: 21 اختبارًا (تقارير، ذمم، أرصدة
  افتتاحية بما فيها تزامن حقيقي، فترات محاسبية، نطاق فرع، IDOR، RBAC) —
  راجع `docs/TESTING.md`. المجموع الكلي 112/112 بلا أي تراجع.

### أُصلِح
- `JournalService.reverseJournalEntry`: ترتيب عمليتين كان يخلق لحظة
  عابرة (ضمن نفس المعاملة) يكون فيها القيد الأصلي وقيد عكسه معًا
  `status: 'posted'`، ما ينتهك عمليًا فهرس تزامن الرصيد الافتتاحي
  الجديد — صُحِّح بتعليم الأصلي `reversed` قبل إنشاء قيد العكس.
- الواجهة الأمامية: قيم مالية في `ReportsPage.tsx`/
  `ReceivablesPayablesPage.tsx` كانت تُعرَض بـ`toLocaleString('ar-SA',
  ...)` (أرقام هندية شرقية، مثل ٢٠٫٠٠) بدل الأرقام الغربية المستخدمة في
  كل صفحة أخرى بالتطبيق — صُحِّحت إلى `.toFixed(2)`، اكتُشفت أثناء
  اختبار Playwright يدوي حقيقي عبر متصفح.

### قرارات معمارية مسجَّلة
- **طبقة استعلام مشتركة لكل التقارير**: `AccountingReportsService` مصدر
  بيانات واحد لكل التقارير الأربعة، فلا يمكن لأي تقرير أن ينحرف عن
  الآخر أو عن الدفتر الفعلي.
- **بند "أرباح مرحّلة غير مقفلة" محسوب وقت الاستجابة، ليس قيدًا
  مُرحَّلًا**: لا صف `JournalEntry`/`JournalLine` جديد، موسوم `computed:
  true` صراحة في استجابة الـAPI.
- **الرصيد الافتتاحي المحاسبي = `JournalEntry` عادي، لا جدول جديد ولا
  آلية ترحيل موازية**.
- **فهرس فريد جزئي على مستوى Postgres بدل قفل تطبيقي** لضمان رصيد
  افتتاحي "نشط" واحد — يعمل حتى تحت سباق تزامن حقيقي.
- **إقفال الفترة يمنع قيودًا جديدة فقط، ولا يمس أي قيد سابق أبدًا** —
  امتداد لمبدأ "عكس لا تعديل" الثابت منذ المرحلة 1.
- **لا تغيير على قرار COGS/تقييم المخزون** — لا يزال مفتوحًا كما في
  نهاية المرحلة 4، لم يُلمَس في هذا الـMilestone.
- **AR بنية جاهزة لكن فارغة عمدًا حتى قرار عمل مستقبلي**: بناء بيع آجل
  فعلي قرار منفصل تمامًا، لم يُطلَب في هذا الـMilestone.

## [Phase 4] - 2026-08-15

Purchases + Expenses + Chart of Accounts + Journal Entries + تكامل محاسبي
تلقائي للمبيعات/المشتريات/المصروفات — أول أساس Double-Entry حقيقي في
qeedha B، بنفس مبادئ SaaS متعدد المستأجرين من اليوم الأول (Company/
Membership/Role/Permission/Branch Scope/RLS/Audit) — بلا إعادة بناء أي من
أساسات المراحل 1/2/2.1/3.

### أُضيف
- Prisma schema: `purchases, purchase_items, purchase_sequences,
  expense_categories, expenses, accounts, journal_entries, journal_lines`
  — كل جدول بـRLS (`FORCE ROW LEVEL SECURITY` + policy `tenant_isolation`)
  مستقل. لا تعديل على أي جدول من المراحل السابقة.
- 9 صلاحيات RBAC جديدة (`purchases.read`, `purchases.create`,
  `purchases.cancel`, `expenses.read`, `expenses.create`,
  `expenses.update`, `expenses.delete`, `accounting.read`,
  `accounting.manage`) وتحديث الأدوار الافتراضية.
- وحدة `purchases`: تدفق صريح بخطوتين — `createPurchase` (الطلب فقط، لا
  أثر مخزون/محاسبة) ثم `receivePurchase` (انتقال حالة محروس ذرّيًا
  `ordered→received`، خصم/إضافة مخزون عبر `InventoryService.recordMovement`
  الموجود أصلًا، ثم ترحيل قيد واحد: مدين مخزون + ضريبة مدخلات، دائن ذمم
  دائنة). إلغاء يعمل فقط قبل الاستلام (409 بعده). ترقيم مرجعي ذرّي
  (`PUR-######`) بنفس نمط `InvoiceNumberService`، Idempotency عبر
  `clientReferenceId` بنفس نمط `Sale`.
- وحدة `expenses`: مصروف مدفوع فورًا (لا حالة "مستحق")، `branchId`
  اختياري صراحة (مصروف على مستوى المنشأة مسموح)، فئات مصروفات قابلة
  للتوسيع (6 افتراضية مزروعة عند التسجيل، كل واحدة مربوطة بحساب محاسبي).
  تعديل حقل مالي (مبلغ/فئة/طريقة دفع) يعكس القيد القديم ويرحّل قيدًا
  جديدًا؛ الحذف إلغاء ناعم (`status: cancelled`) يعكس القيد النشط فقط.
- وحدة `accounting`: `AccountingService` (دليل حسابات شجري، `code` فريد
  لكل منشأة كمفتاح Account Mapping ثابت — وليس UUID، `name`/`isActive`
  فقط قابلان للتعديل بعد الإنشاء) + `JournalService` (نقطة العبور
  الداخلية الوحيدة لترحيل/عكس أي قيد، يتحقق من توازن مدين=دائن ويرفض قيدًا
  صفريًا). دليل حسابات افتراضي (21 حسابًا) + 6 فئات مصروفات افتراضية
  تُزرَعان تلقائيًا داخل نفس معاملة `AuthService.registerCompany` لكل
  منشأة جديدة، بلا تغيير في عقد Endpoint التسجيل.
- **لا إدخال يدوي مزدوج، بتصميم الكود نفسه**: `JournalEntriesController`
  قراءة فقط — لا `POST`/`PATCH`/`DELETE` مُعرَّف على الإطلاق تحت
  `/accounting/journal-entries`. تصحيح قيد يتم حصرًا عبر
  `JournalService.reverseJournalEntry` (قيد جديد بمدين/دائن مقلوبين،
  الأصلي يُعلَّم `reversed` بلا أي تعديل مباشر على سطوره).
- تكامل محاسبي تلقائي: `SalesService.createSale`/`cancelSale`،
  `PurchasesService.receivePurchase`، و`ExpensesService` تستدعي
  `JournalService` داخل نفس معاملة العملية التجارية — فشل الترحيل يُلغي
  العملية كاملة معه.
- واجهة أمامية: `/purchases` (إنشاء أمر شراء + استلامه)، `/expenses`
  (تسجيل/تعديل/حذف مصروف + إدارة فئاته)، `/accounting` (قراءة فقط، تبويبا
  "دليل الحسابات"/"القيود المحاسبية").
- `test/phase4.e2e-spec.ts`: 28 اختبارًا (دليل حسابات، سلامة القيد
  المحاسبي، مشتريات، مصروفات، تكامل محاسبي، RLS مباشر) — راجع
  `docs/TESTING.md`. المجموع الكلي 91/91 بلا أي تراجع.
- توثيق جديد: `docs/PURCHASING.md`, `docs/EXPENSES.md`,
  `docs/CHART_OF_ACCOUNTS.md`, `docs/JOURNAL_ENTRIES.md`؛ إعادة كتابة
  `docs/ACCOUNTING.md` بالكامل (من تصميم مرجعي إلى توثيق التنفيذ الفعلي).

### قرارات معمارية مسجَّلة
- **الشراء هو الفاتورة**: لا كيان `PurchaseInvoice` منفصل — `Purchase`
  يحمل كل مبالغ فاتورة المورد ورقمًا مرجعيًا ذرّيًا بنفسه.
- **تدفق شراء بخطوتين صريحتين، وليس معاملة واحدة كـ`Sale`**: يعكس واقع
  العمل الحقيقي (طلب ثم استلام لاحق، ربما بواسطة شخص آخر).
- **لا صلاحية `purchases.receive` منفصلة**: الاستلام يشترك مع
  `purchases.create` عمدًا.
- **المصروف مدفوع دائمًا**: لا حالة "مستحق" — القيد الناتج ثابت الشكل
  (مدين مصروف/دائن نقدية أو بنك) بلا حالة وسيطة.
- **الترميز الثابت (`Account.code`) هو مفتاح Account Mapping، وليس UUID**:
  أول مكان في النظام يُحلّ فيه مرجع كيان عبر حقل نصي مستقر بدل معرّف قاعدة
  بيانات ثابت.
- **توقُّف متعمَّد عند تقييم المخزون (COGS)**: لا قرار FIFO/متوسط مرجّح
  بعد، فلا سطر مخزون/COGS في قيد البيع — قرار موثَّق صراحة وليس إغفالًا،
  راجع `docs/ACCOUNTING.md` "مؤجَّل".
- **لا ذمم مدينة/دائنة كاملة، لا مرتجعات مشتريات، لا فترات مالية/إغلاق،
  لا تسوية بنكية، لا تنفيذ ZATCA أو تكامل قيّدها فعلي** — خارج نطاق
  المرحلة 4 المتفَق عليه، موثَّق صراحة في `docs/ACCOUNTING.md`/
  `docs/PURCHASING.md` "مؤجَّل".

## [Phase 3] - 2026-08-15

POS + Sales + Payments + Invoices + أساس التكامل، مبنية بنفس مبادئ SaaS
متعدد المستأجرين من اليوم الأول (Company/Membership/Role/Permission/Branch
Scope/RLS/Audit) — بلا إعادة بناء أي من أساسات المراحل 1/2/2.1.

### أُضيف
- Prisma schema: `sales, sale_items, payments, invoice_sequences, invoices`
  — كل جدول بـRLS (`FORCE ROW LEVEL SECURITY` + policy `tenant_isolation`)
  مستقل. لا تعديل على أي جدول من المراحل السابقة.
- 4 صلاحيات RBAC جديدة (`sales.read`, `sales.create`, `sales.cancel`,
  `invoices.read`) وتحديث الأدوار الافتراضية (Cashier: بيع بلا إلغاء؛
  Manager/Owner: كل الصلاحيات؛ Accountant: قراءة فقط).
- وحدة `sales`: `SalesService.createSale` كمعاملة ذرّية واحدة (تحقق
  المستودع/الفرع/جهاز POS/العميل/المنتجات → حساب المبالغ → Sale → SaleItems
  → خصم مخزون عبر `InventoryService.recordMovement` الموجود أصلًا → Payments
  → رقم فاتورة ذرّي → Invoice → Audit)، إلغاء بيع كامل (لا مرتجعات جزئية)،
  Idempotency عبر `clientReferenceId` فريد لكل منشأة (مع معالجة سباق تزامن
  حقيقي عبر التقاط انتهاك قيد التفرّد وإعادة جلب السجل الأصلي).
- وحدة `invoices` (قراءة فقط): `InvoiceNumberService` بترقيم ذرّي لكل منشأة
  بنفس نمط `recordMovement` الذرّي.
- تفعيل أول استهلاك فعلي لـ`BranchScopeService`/`PosDevice` خارج وحدة
  `inventory` — `sales.create` يشتق الفرع من المستودع دائمًا، ويتحقق أن جهاز
  POS (إن أُرسل) يتبع نفس فرع المستودع.
- واجهة أمامية: شاشة POS حقيقية متصلة (`/pos`) — بحث/مسح منتج، سلة، كمية
  وخصم لكل سطر، عميل اختياري، دفع (بما فيه Split payment)، إتمام بيع، عرض
  نتيجة الفاتورة؛ شاشة مبيعات/فواتير للقراءة (`/sales`). اختُبرت عبر متصفح
  حقيقي (Playwright): مسار ناجح كامل + سيناريو فشل (مخزون غير كافٍ).
- `test/phase3.e2e-spec.ts`: 25 اختبارًا (وظيفية + أمنية + تزامن حقيقي) —
  راجع `docs/TESTING.md`. المجموع الكلي 63/63 بلا أي تراجع.
- توثيق جديد: `docs/SALES.md`, `docs/PAYMENTS.md`, `docs/INVOICES.md`,
  `docs/INTEGRATION.md`؛ تحديث `docs/POS.md` (من تصميم مرجعي إلى توثيق
  التنفيذ الفعلي) و`docs/QEEDHA_INTEGRATION.md`.

### قرارات معمارية مسجَّلة
- **لا طبقة Payment abstraction ثانية**: `PaymentIntegrationPort`/
  `IntegrationRegistry` من المرحلة 1 أُعيد استخدامهما كما هما (بلا تعديل)
  كنقطة الاتصال الوحيدة المستقبلية لمزوّد خارجي؛ طرق الدفع المحلية
  (نقدي/بطاقة/تحويل/أخرى) لا تمر عبرهما إطلاقًا لعدم الحاجة لاتصال خارجي.
- **Split payment مدعوم بنيويًا من اليوم الأول**: `Payment` علاقة واحد-إلى-
  متعدد مع `Sale` (وليس عمودًا واحدًا) — تفاديًا لـMigration كاسرة لاحقًا.
- **فحص النطاق في طبقة الخدمة، ليس Guard جديد**: نفس قرار المرحلة 2.1 يمتد
  حرفيًا لوحدة `sales` — لا Guard عام جديد لفحص الفرع/المستودع/جهاز POS.
- **لا نظام مرتجعات جزئي، لا ورديات كاشير، لا سلات معلّقة على الخادم**: خارج
  نطاق المرحلة 3 المتفَق عليه، موثَّق صراحة في `docs/POS.md`/`docs/SALES.md`
  "مؤجَّل" — النموذج الحالي لا يمنع إضافتها لاحقًا.
- **لا تجاوز سعر (Price override)**: `SaleItem.unitPrice` يُنسَخ دائمًا من
  سعر المنتج الحالي وقت البيع؛ الخصم لكل سطر هو الآلية الوحيدة لتعديل القيمة.
- **لا تنفيذ ZATCA أو تكامل قيّدها فعلي** — الحقول/التصميم جاهزان لاستقبالهما
  لاحقًا فقط.

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
