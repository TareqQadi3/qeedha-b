# حالة المشروع (Project Status)

**آخر تحديث**: 2026-08-15
**المرحلة الحالية**: Phase 2 — Products + Inventory + Customers + Suppliers
— **مكتملة ومُختبرة**، بانتظار موافقتك الصريحة لبدء المرحلة 3

## الحالة الإجمالية: 🟢 جاهز — بانتظار موافقتك الصريحة على بدء المرحلة 3

## ما تم إنجازه في هذه الدورة (المرحلة 2)

بُنيت كل وحدة كوحدة SaaS كاملة من اليوم الأول: multi-tenant، معزولة بـRLS،
محمية بـRBAC، قابلة للتدقيق (Audit)، وبواجهة أمامية حقيقية متصلة — وليس
Backend فقط ثم واجهة لاحقًا.

- [x] Prisma schema: 12 جدولًا جديدًا (`units, product_categories, brands,
      products, product_barcodes, stock_levels, stock_movements,
      stock_adjustments, stock_counts, stock_count_lines, customers,
      suppliers`) — كل جدول بـ`FORCE ROW LEVEL SECURITY` + policy
      `tenant_isolation` مستقل.
- [x] 16 صلاحية RBAC جديدة (`products.*` ×4, `inventory.*` ×4,
      `customers.*` ×4, `suppliers.*` ×4)، والأدوار الافتراضية الخمسة
      محدَّثة لتعكسها بشكل مناسب لكل دور (Owner كل شيء، Cashier قراءة فقط
      للمنتجات/العملاء، إلخ).
- [x] وحدة `catalog`: Products + Categories (شجرية عبر self-relation) +
      Brands + Units. تحقق صريح من ملكية المراجع عبر المنشآت
      (`categoryId`/`brandId`/`unitId` يجب أن تعود لنفس المنشأة). SKU
      وباركود فريدان لكل منشأة (وليس عالميًا). أحداث Audit منفصلة لتغيّر
      السعر (`products.product.price_change`) وتغيّر SKU
      (`products.product.sku_change`) بالإضافة للحدث العام.
- [x] وحدة `inventory`: `InventoryService.recordMovement` هو المسار الوحيد
      لتعديل رصيد المخزون في الكود بأكمله، بنمط ذرّي (`INSERT ... ON
      CONFLICT DO NOTHING` + `UPDATE` محروس يمنع الأرصدة السالبة ويمنع فقدان
      التحديثات تحت تزامن حقيقي) — **مُختبَر تجريبيًا** بـ10 طلبات HTTP
      متزامنة حقيقية، ليس نظريًا فقط. رصيد افتتاحي، تسوية، تحويل فوري ذرّي
      بين مستودعين، ودورة جرد مخزون كاملة (draft → تحديث سطور → اعتماد ينتج
      حركات تسوية تلقائيًا للفروقات → تجميد السطور).
- [x] وحدة `parties`: Customers/Suppliers ككيانين منفصلين عمدًا (سيتباعدان
      في مرحلة الذمم المدينة/الدائنة لاحقًا)، `reference` فريد اختياري لكل
      منشأة، `phone` غير فريد عمدًا، بلا حقول Qeedha مُخترَعة.
- [x] واجهة أمامية حقيقية (`/frontend`, React 18 + Vite + TypeScript +
      Tailwind RTL): تسجيل دخول/تسجيل منشأة (بما فيه اختيار المنشأة
      لمستخدم متعدد العضويات)، لوحة تحكم بمؤشرات من بيانات حقيقية فقط، شاشات
      المنتجات/الكتالوج/المخزون/العملاء/الموردين متصلة فعليًا بالـAPI. اختُبرت
      يدويًا عبر متصفح حقيقي (Playwright) بتشغيل فعلي متزامن للـbackend
      والـfrontend — 9 سيناريوهات مستخدم كاملة (تسجيل، إنشاء تصنيف/علامة/
      وحدة، إنشاء منتج، رصيد افتتاحي، عميل، مورد، تسجيل خروج) بلا أخطاء
      console/page.
- [x] `test/phase2.e2e-spec.ts`: 33 اختبارًا (وظيفية + أمنية عبر-المنشآت،
      بما فيها اختبار RLS مباشر بدون طبقة الخدمة) — كلها ناجحة مع اختبارات
      المرحلة 1.
- [x] توثيق كامل محدَّث: `DATABASE.md`, `DOMAIN_MODEL.md`, `ARCHITECTURE.md`,
      `MODULES.md`, `API.md`, `SECURITY.md`, `TESTING.md`, `CHANGELOG.md`,
      `IMPORT_EXCEL.md` (قسم جاهزية المخطط).

## التقرير النهائي (بالصيغة المطلوبة)

**الحالة**: ✅ PASS — المرحلة 2 مكتملة ومُختبرة بالكامل.

| البند | النتيجة |
|---|---|
| Products | ✅ PASS |
| Inventory | ✅ PASS |
| Customers | ✅ PASS |
| Suppliers | ✅ PASS |
| Excel Import | ⏸️ Deferred (جاهزية المخطط موثَّقة في `IMPORT_EXCEL.md`؛ لا Wizard فعلي — كما هو مطلوب، مؤجَّل للمرحلة 5) |
| Frontend | ✅ PASS (متصل فعليًا بالـAPI، مُختبَر عبر متصفح حقيقي) |
| Multi-tenancy | ✅ PASS (كل جدول جديد `company_id` + عزل مُختبَر) |
| RLS | ✅ PASS (`FORCE ROW LEVEL SECURITY` على كل جدول جديد + اختبار RLS مباشر) |
| RBAC | ✅ PASS (16 صلاحية جديدة، مُختبَرة برفض 403 عند غيابها) |
| Branch/Warehouse Security | ⚠️ **جزئي — موثَّق بصراحة** (راجع "قرارات معمارية" أدناه؛ عزل المنشآت كامل، عزل الفروع *داخل* نفس المنشأة غير مُفعَّل بعد في `PermissionsGuard`) |
| Audit | ✅ PASS (بما فيها أحداث منفصلة لتغيّر السعر/SKU) |
| Security | ✅ PASS (سلامة مراجع عبر-المنشآت، تزامن ذرّي، لا ثقة بـ`companyId` من العميل) |
| Tests | ✅ PASS (33/33) |
| E2E | ✅ PASS (33/33، `npx jest --config ./test/jest-e2e.json --runInBand`) |
| Build | ✅ PASS (`nest build` بدون أخطاء) |
| Lint | ✅ PASS (`eslint . --ext .ts` — 0 أخطاء) |
| Typecheck | ✅ PASS (`tsc --noEmit` — 0 أخطاء) |
| Documentation | ✅ PASS (9 ملفات محدَّثة، هذا الملف ضمنها) |

### Files Changed (ملخص)
- **Backend (جديد)**: `src/modules/catalog/**`, `src/modules/inventory/**`,
  `src/modules/parties/**`, `src/common/dto/pagination-query.dto.ts`,
  `src/common/utils/pagination.ts`, `test/phase2.e2e-spec.ts`,
  `prisma/migrations/20260815150000_phase2_catalog_inventory_parties/`.
- **Backend (معدَّل)**: `prisma/schema.prisma`, `src/app.module.ts`,
  `src/modules/iam/constants/permissions.ts`,
  `src/modules/iam/constants/default-roles.ts`, `package.json`/`package-lock.json`
  (إضافة `@nestjs/mapped-types`).
- **Frontend (جديد بالكامل)**: `/frontend` — راجع `frontend/README.md`
  للنطاق التفصيلي.
- **Docs (معدَّل)**: `DATABASE.md`, `DOMAIN_MODEL.md`, `ARCHITECTURE.md`,
  `MODULES.md`, `API.md`, `SECURITY.md`, `TESTING.md`, `CHANGELOG.md`,
  `IMPORT_EXCEL.md`, `PROJECT_STATUS.md` (هذا الملف).

### Database Changes
Migration واحدة (`20260815150000_phase2_catalog_inventory_parties`) — 12
جدولًا جديدًا + RLS policies لكل منها. طُبِّقت بنجاح على قاعدتي التطوير
(`qeedha_accounting`) والاختبار (`qeedha_accounting_test`). لا تعديل ولا حذف
لأي جدول من المرحلة 1 أو Auth refactor.

### API Changes
راجع `docs/API.md` قسم "Endpoints المرحلة الثانية" للجدول الكامل: 11 مسارًا
تحت `/catalog` + `/products`، 10 مسارات تحت `/inventory`، 8 مسارات تحت
`/customers` + `/suppliers`. كلها خلف نفس سلسلة الحراسة
(`JwtAuthGuard → MembershipGuard → PermissionsGuard`).

### Frontend Changes
تطبيق React كامل جديد (`/frontend`) — تسجيل دخول/تسجيل، لوحة تحكم، 5 شاشات
وحدات (منتجات، كتالوج، مخزون، عملاء، موردون)، RTL بالكامل، بألوان هوية
Qeedha Accounting (`#0e5f58` / `#f5a623`). راجع `frontend/README.md` للنطاق
الدقيق وما هو مؤجَّل عمدًا.

### Deferred (مؤجَّل عمدًا — وليس نسيانًا)
- معالج استيراد Excel الفعلي (`import_jobs`/`import_job_rows` + الواجهة) —
  جاهزية المخطط موثَّقة، التنفيذ الكامل للمرحلة 5.
- تفعيل نطاق الفروع في `PermissionsGuard` (راجع البند التالي).
- التحويل متعدد المراحل بين المستودعين (طلب → شحن → استلام) — التحويل
  الحالي فوري ذرّي فقط.
- شاشات الجرد (Stock Count) والتحويل في الواجهة الأمامية — الـAPI جاهز
  ومُختبَر بالكامل، الواجهة تُضاف لاحقًا (موثَّق في `frontend/README.md`).
- تعديل/حذف من الواجهة الأمامية (متاح عبر الـAPI ومُختبَر، الشاشات الحالية
  تركّز على العرض والإضافة).
- تبديل اللغة إنجليزي/LTR في الواجهة (بنية RTL جاهزة، i18n كامل مؤجَّل).
- حقول ائتمان/رصيد/حد ائتماني للعملاء والموردين — تنتمي لمرحلة المحاسبة.
- POS، Sales، Purchases، Expenses، Accounting الكاملة، ZATCA، تكامل قيّدها
  الفعلي، Control Center، Website، اشتراكات فعلية — **لم تُبنَ ولن تُبنى في
  هذه المرحلة**، كما هو مطلوب صراحة.

### Known Issues
لا مشاكل معروفة غير موثَّقة أعلاه. كل الاختبارات خضراء، build/lint/typecheck
نظيفة.

### Architectural Decisions (قرارات مسجَّلة)
- **نطاق الفروع/المستودعات في RBAC لم يُفعَّل بعد**: `MembershipRole.branchId`
  موجود في المخطط منذ Auth refactor، لكن `PermissionsGuard` في المرحلة 2 **لا
  يقرأه ولا يفرضه**. عمليًا: أي عضو يملك صلاحية مثل `inventory.adjust` يستطيع
  التأثير على **أي** مستودع تابع لمنشأته، بصرف النظر عن أي نطاق فرع مُسنَد له.
  الفصل المفروض فعليًا هو الفصل **بين المنشآت** (tenant isolation عبر RLS)،
  وهذا فصل مختلف تمامًا عن الفصل بين الفروع **داخل** نفس المنشأة. هذا قرار
  موثَّق بصراحة تامة في `docs/DOMAIN_MODEL.md` و`docs/SECURITY.md` وليس نظامًا
  مزيّفًا أو ثغرة مسكوت عنها — التوسّع المستقبلي (تفعيل فحص `branchId`) مخطَّط
  له ولم يُبنَ بعد.
- سلامة المراجع عبر المنشآت (category/brand/unit/warehouse) تُفرض في طبقة
  التطبيق صراحة (`assertReferencesOwnedByTenant`, `assertWarehouseOwned`)
  لأن FK وحده في Postgres لا يعبّر عن "نفس الصف وفي نفس المنشأة معًا".
- استراتيجية التزامن لكتابة المخزون: `INSERT ... ON CONFLICT DO NOTHING` +
  `UPDATE` محروس ذرّي (وليس Prisma `upsert()`، غير ذرّي فعليًا على Postgres
  تحت تزامن حقيقي) — تفاصيل كاملة في `DATABASE.md`/`SECURITY.md`.
- Customers/Suppliers ككيانين منفصلين تمامًا في الكود (لا تجريد Party مشترك)
  لأنهما سيتباعدان في مرحلة الذمم المدينة/الدائنة، والتجريد المبكر كان سيُعقّد
  ذلك التوسّع دون فائدة حالية.
- التحويل بين المستودعين فوري ذرّي فقط في هذه المرحلة؛ لا حالة "بالطريق".
- لا حقول Qeedha-specific مُخترَعة في `customers`/`suppliers` — أي توافق
  مستقبلي مع qeedha يمر عبر Integration Layer حصرًا.

### Commit
سيُنفَّذ commit واحد نظيف لكل تغييرات المرحلة 2 (بدون push، حسب التعليمات
الصريحة) بعد هذا التحديث. راجع رسالة الـcommit للـhash النهائي.

## ما لم يبدأ بعد (بانتظار إذنك للانتقال)

المرحلة 3 (POS/Sales/Purchases/Expenses جزئيًا حسب الخطة، محاسبة أساسية) —
راجع `ROADMAP.md`. لا كود لأي من هذه الوحدات بعد. **لن يبدأ التنفيذ إلا بعد
موافقتك الصريحة، ولن يُبدأ تلقائيًا.**

## قرارات تحتاج نقاشًا معك لاحقًا (مؤجَّلة عمدًا، ليست الآن)

- خوارزمية تقييم المخزون (FIFO/Weighted Average) — عند المرحلة 4.
- تفاصيل Offline POS الكاملة — عند المرحلة 3.
- تفعيل نطاق الفروع الفعلي في RBAC — يحتاج قرارك حول الأولوية الزمنية له
  نسبةً لمرحلة POS.
- الموجة/الحد المالي المطبَّق لـZATCA Phase 2 — عند المرحلة 6.
- عقد API الفعلي لقيّدها (Endpoints, Auth, Fields) — عند المرحلة 7، بانتظار
  توثيق منك.

## كيف تتحقق من الحالة الحالية محليًا

Backend: `cd backend && npm install && npx prisma migrate deploy && npm run
prisma:seed && npm run start:dev`، ثم `npm run test:e2e` (33/33 حاليًا).
Frontend: `cd frontend && npm install && npm run dev` (يتطلب backend يعمل
على `http://localhost:3000`).

## سجل تحديثات هذا الملف

- 2026-08-15: إنشاء الملف عند بدء المرحلة 1.
- 2026-08-15: المرحلة 1 مكتملة ومُختبرة (10/10 اختبارات e2e ناجحة، build/lint نظيفان).
- 2026-08-15: إعادة هيكلة Auth/IAM لنموذج User/Tenant/Membership مكتملة
  ومُختبرة (16/16، build/lint نظيفان) — بانتظار موافقة صريحة لبدء المرحلة 2.
- 2026-08-15: المرحلة 2 (Products/Inventory/Customers/Suppliers + Frontend)
  مكتملة ومُختبرة (33/33، build/lint/typecheck نظيفة) — بانتظار موافقة صريحة
  لبدء المرحلة 3.
