# حالة المشروع (Project Status)

**آخر تحديث**: 2026-08-16
**المرحلة الحالية**: Milestone 4 — ZATCA E-Invoicing Readiness (توليد رمز
QR محلي وفق مواصفة Phase 1 المنشورة عند كل فاتورة، جدول امتثال منفصل
`invoice_compliance`، طبقة `EInvoiceService` معزولة تمامًا عن SalesService/
InvoicesService؛ **Phase 2 كاملة — XML/Hashing/التوقيع/CSID/الإرسال
الفعلي — Blocked** بانتظار عقد ZATCA واعتمادات حقيقية) — **مكتملة
ومُختبرة ضمن نطاقها المُنفَّذ**، بانتظار موافقتك الصريحة لبدء المرحلة
القادمة

## الحالة الإجمالية: 🟢 جاهز — بانتظار موافقتك الصريحة على بدء المرحلة القادمة

## ملخص: ما هذه المرحلة وما ليست

أساس المحاسبة الحقيقي الأول في qeedha B: مشتريات بتدفق طلب→استلام صريح،
مصروفات مدفوعة فورًا، ودليل حسابات + قيود محاسبية مزدوجة (Double-Entry)
تُرحَّل تلقائيًا من كل عملية تجارية — بلا أي إدخال يدوي مزدوج ممكن عبر
الـAPI. لم تُبنَ في هذه المرحلة: تكلفة البضاعة المباعة/تقييم المخزون
(FIFO/متوسط مرجّح — قرار مفتوح متعمَّد)، ذمم مدينة/دائنة كاملة (Subledger
لكل عميل/مورد)، مرتجعات مشتريات، فترات مالية/إغلاق، تسوية بنكية، ZATCA
فعلي، Qeedha Connector فعلي، Control Center، Website، اشتراكات فعلية —
كلها موثَّقة صراحة أدناه تحت "مؤجَّل عمدًا" و`docs/ACCOUNTING.md`
"مؤجَّل".

## ما تم إنجازه في هذه الدورة (المرحلة 4)

- [x] Prisma schema: 8 جداول جديدة (`purchases, purchase_items,
      purchase_sequences, expense_categories, expenses, accounts,
      journal_entries, journal_lines`) — كل جدول بـ`FORCE ROW LEVEL
      SECURITY` + policy `tenant_isolation` مستقل. لا تعديل على أي جدول من
      المراحل السابقة.
- [x] 9 صلاحيات RBAC جديدة (`purchases.read`, `purchases.create`,
      `purchases.cancel`, `expenses.read`, `expenses.create`,
      `expenses.update`, `expenses.delete`, `accounting.read`,
      `accounting.manage`)، تحديث الأدوار الافتراضية (Manager: كل
      المشتريات/المصروفات + قراءة محاسبية؛ Accountant: يدير دليل الحسابات
      والمصروفات، قراءة فقط للمبيعات/المشتريات؛ Inventory Manager: شراء
      واستلام مخزون بلا إلغاء؛ Cashier: بلا أي صلاحية من المرحلة).
- [x] وحدة `purchases`: تدفق صريح بخطوتين (`createPurchase` — الطلب فقط،
      لا أثر مخزون/محاسبة؛ `receivePurchase` — انتقال حالة محروس ذرّيًا
      (`UPDATE ... WHERE status='ordered'`) ثم خصم/إضافة مخزون عبر
      `InventoryService.recordMovement` الموجود أصلًا ثم ترحيل قيد واحد).
      إلغاء يعمل فقط قبل الاستلام. Idempotency عبر `clientReferenceId`،
      ترقيم مرجعي ذرّي (`PUR-######`) بنفس نمط `InvoiceNumberService`.
- [x] وحدة `expenses`: مصروف مدفوع فورًا (لا حالة "مستحق")، فرع اختياري
      (مصروف على مستوى المنشأة مسموح)، فئات مصروفات قابلة للتوسيع (6
      افتراضية مزروعة عند التسجيل) مربوطة بحسابات محاسبية. تعديل حقل مالي
      يعكس القيد القديم ويرحّل قيدًا جديدًا؛ الحذف إلغاء ناعم يعكس القيد
      فقط. Idempotency عبر `clientReferenceId`.
- [x] وحدة `accounting`: `AccountingService` (دليل الحسابات — إنشاء/تعديل
      حساب، `name`/`isActive` فقط قابلان للتعديل، لا تعديل على `code`/
      `type`) + `JournalService` (نقطة العبور الوحيدة لترحيل/عكس أي قيد،
      يتحقق من توازن مدين=دائن ويرفض قيدًا صفريًا). دليل حسابات افتراضي
      (21 حسابًا) + 6 فئات مصروفات افتراضية يُزرَعان تلقائيًا داخل نفس
      معاملة `AuthService.registerCompany` لكل منشأة جديدة — بلا تغيير في
      عقد Endpoint التسجيل. **لا Endpoint لإنشاء/تعديل/حذف قيد محاسبي على
      الإطلاق** — `JournalEntriesController` قراءة فقط بتصميم الكود.
- [x] تكامل محاسبي تلقائي: `SalesService.createSale`/`cancelSale`،
      `PurchasesService.receivePurchase`، و`ExpensesService` (إنشاء/تعديل
      مالي/حذف) تستدعي `JournalService` داخل نفس معاملة العملية التجارية
      — فشل ترحيل القيد يُلغي العملية كاملة معه.
- [x] واجهة أمامية جديدة: `/purchases` (أوامر شراء + استلام)، `/expenses`
      (تسجيل/تعديل/حذف مصروفات وفئاتها)، `/accounting` (قراءة فقط، تبويبا
      "دليل الحسابات" و"القيود المحاسبية").
- [x] `test/phase4.e2e-spec.ts`: 28 اختبارًا جديدًا (دليل حسابات/سلامة
      قيد/مشتريات/مصروفات/تكامل محاسبي/RLS مباشر) — **91/91 إجمالًا بلا
      أي تراجع** عن المراحل 1/2/2.1/3.
- [x] Browser test (Playwright) يدوي: دخول → مشتريات (إنشاء + استلام،
      تحقق زيادة المخزون عبر الـAPI) → مصروفات (إنشاء، تحقق توازن القيد
      عبر الـAPI) → محاسبة (دليل الحسابات ظاهر، نافذة تفاصيل قيد تُظهر
      مدين = دائن) — كل الخطوات نجحت بلا أخطاء console.
- [x] توثيق جديد: `PURCHASING.md`, `EXPENSES.md`, `CHART_OF_ACCOUNTS.md`,
      `JOURNAL_ENTRIES.md`؛ إعادة كتابة `ACCOUNTING.md` (من تصميم مرجعي
      إلى توثيق التنفيذ الفعلي)؛ تحديث `DOMAIN_MODEL.md`, `DATABASE.md`,
      `API.md`, `SECURITY.md`, `TESTING.md`, `CHANGELOG.md`.

## التقرير النهائي (بالصيغة المطلوبة)

# Phase 4 — Purchases + Expenses + Accounting Foundation

**Status**: Completed

**Purchases**: PASS (تدفق طلب→استلام، ترقيم مرجعي ذرّي، Idempotency)
**Expenses**: PASS (فرع اختياري، فئات قابلة للتوسيع، تعديل/حذف يعكسان القيد)
**Chart of Accounts**: PASS (دليل افتراضي كامل مزروع تلقائيًا لكل منشأة)
**Journal Entries**: PASS (posted/reversed فقط، عكس بلا تعديل مباشر أبدًا)
**Double-Entry Integrity**: PASS (توازن مدين=دائن مُتحقَّق عند كل ترحيل،
قيد صفري مرفوض)
**No Manual Journal Entry**: PASS (لا `POST`/`PATCH`/`DELETE` على
`/accounting/journal-entries` — مُختبَر صراحة أن السطح غير موجود)
**Inventory Integration**: PASS (خصم/إضافة ذرّي عبر `recordMovement`
الموجود أصلًا، لا مسار كتابة جديد)
**Accounting Integration**: PASS (Sale/Purchase/Expense تُرحّل قيدها داخل
نفس معاملتها الذرّية؛ فشل الترحيل يُلغي العملية كاملة)
**Branch Scope**: PASS (`BranchScopeService` نفسه من المرحلة 2.1، يمتد
لـPurchase عبر فرع المستودع، ولـExpense عند وجود `branchId` فقط)
**Tenant Isolation**: PASS (RLS + فحوصات تطبيقية صريحة، كما في كل مرحلة سابقة)
**RLS**: PASS (`FORCE ROW LEVEL SECURITY` على كل جدول جديد من الثمانية +
اختبار RLS مباشر)
**RBAC**: PASS (9 صلاحيات جديدة، مُختبَرة برفض 403 عند غيابها)
**Audit**: PASS (`purchases.purchase.create/receive/cancel`,
`expenses.expense.create/update/delete`, `expenses.category.create`,
`accounting.account.create/update`, `accounting.journal.post/reverse`)
**Idempotency**: PASS (`clientReferenceId` على Purchase وExpense، مُختبَر
بطلبات متزامنة حقيقية لكل منهما)
**Concurrency**: PASS (استلام شراء متزامن حقيقي: مرة واحدة تنجح فقط، لا
مضاعفة مخزون؛ 10 طلبات إنشاء شراء متزامنة تُنتج 10 أرقام مرجعية فريدة؛ 5
طلبات إنشاء مصروف متزامنة بنفس المفتاح تُنتج مصروفًا واحدًا فقط)
**Frontend**: PASS (شاشات `/purchases`, `/expenses`, `/accounting` متصلة
بالكامل بالـAPI)
**Browser Tests**: PASS (Playwright يدوي، مسار كامل عبر الثلاث وحدات)
**E2E**: PASS (91/91، `npx jest --config ./test/jest-e2e.json --runInBand`)
**Build**: PASS (`nest build` + frontend `tsc --noEmit && vite build`، بلا
أخطاء)
**Lint**: PASS (`eslint . --ext .ts` / `--ext ts,tsx` — 0 أخطاء في الطرفين)
**Typecheck**: PASS (`tsc --noEmit` — 0 أخطاء في الطرفين)
**Security**: PASS (IDOR، نطاق فرع/مستودع، لا Endpoint لتزوير قيد محاسبي —
راجع `docs/SECURITY.md`)
**SaaS Readiness**: PASS (كل جدول جديد tenant-scoped بـRLS، كل عملية تمر
عبر نفس سلسلة الحراسة، لا انحراف عن نموذج Company/Membership/Role/Permission)
**Documentation**: PASS (4 ملفات توثيق جديدة، 1 مُعاد كتابته بالكامل، 6
ملفات مُحدَّثة)

**Tests**: 91/91 (63 سابقًا + 28 جديدة)

### Files Changed
- **Backend (جديد)**: `src/modules/purchases/**` (module, controller,
  service, purchase-number.service, DTOs)، `src/modules/expenses/**`
  (module, controller, services, DTOs)، `src/modules/accounting/**`
  (module, controllers, services, constants, DTOs)، `prisma/migrations/
  20260815200000_phase4_purchasing_expenses_accounting/`،
  `test/phase4.e2e-spec.ts`.
- **Backend (معدَّل)**: `prisma/schema.prisma`, `src/app.module.ts`,
  `src/modules/auth/auth.service.ts` (بذر دليل الحسابات/فئات المصروفات
  الافتراضية داخل معاملة `registerCompany` نفسها)،
  `src/modules/iam/constants/permissions.ts`,
  `src/modules/iam/constants/default-roles.ts`.
- **Frontend (جديد)**: `src/pages/PurchasesPage.tsx`,
  `src/pages/ExpensesPage.tsx`, `src/pages/AccountingPage.tsx`.
- **Frontend (معدَّل)**: `src/App.tsx`, `src/components/Layout.tsx` (مسارات
  `/purchases`, `/expenses`, `/accounting`).
- **Docs (جديد)**: `PURCHASING.md`, `EXPENSES.md`, `CHART_OF_ACCOUNTS.md`,
  `JOURNAL_ENTRIES.md`.
- **Docs (معدَّل)**: `ACCOUNTING.md` (إعادة كتابة كاملة)، `DOMAIN_MODEL.md`,
  `DATABASE.md`, `API.md`, `SECURITY.md`, `TESTING.md`, `CHANGELOG.md`,
  `PROJECT_STATUS.md` (هذا الملف).

### Database Changes
Migration واحدة (`20260815200000_phase4_purchasing_expenses_accounting`) —
8 جداول جديدة + 4 enums (`PurchaseStatus`, `ExpenseStatus`, `AccountType`,
`JournalEntryStatus`) + RLS policies لكل جدول. طُبِّقت بنجاح
على قاعدتي التطوير والاختبار. لا تعديل ولا حذف لأي جدول من المراحل
السابقة.

### API Changes
راجع `docs/API.md` قسم "Endpoints المرحلة الرابعة": 5 مسارات تحت
`/purchases` (قائمة/تفصيل/إنشاء/استلام/إلغاء)، 7 مسارات تحت `/expenses`
(فئات×2 + مصروفات×5)، 5 مسارات تحت `/accounting` (حسابات×3 + قيود×2،
قراءة فقط للقيود — **لا `POST` عليها**). كلها خلف نفس سلسلة الحراسة
(`JwtAuthGuard → MembershipGuard → PermissionsGuard`) + طبقة نطاق الفرع من
المرحلة 2.1.

### Frontend Changes
ثلاث شاشات جديدة بنفس الهوية البصرية الحالية (لم تُغيَّر): `/purchases`
(إنشاء أمر شراء + استلامه)، `/expenses` (تسجيل/تعديل/حذف مصروف + إدارة
فئاته)، `/accounting` (قراءة فقط، تبويبا "دليل الحسابات"/"القيود
المحاسبية"). راجع `docs/PURCHASING.md`/`docs/EXPENSES.md` للتفصيل الكامل
وما هو مؤجَّل عمدًا في تصميم كل واجهة.

### Architectural Decisions (قرارات مسجَّلة)
- **الشراء هو الفاتورة**: لا كيان `PurchaseInvoice` منفصل — `Purchase`
  نفسه يحمل كل مبالغ فاتورة المورد ورقمًا مرجعيًا ذرّيًا. راجع
  `docs/PURCHASING.md`.
- **تدفق شراء بخطوتين صريحتين، وليس معاملة واحدة**: `createPurchase`
  (طلب فقط) ثم `receivePurchase` (استلام فعلي يلمس المخزون والمحاسبة) —
  يعكس واقع العمل الحقيقي (البضاعة تصل لاحقًا، ربما بواسطة شخص آخر).
- **لا صلاحية `purchases.receive` منفصلة**: الاستلام يشترك مع
  `purchases.create` عمدًا، اتساقًا مع اتفاقية "صلاحية واحدة لكل نوع عملية
  كتابة رئيسية" في هذا النظام.
- **المصروف مدفوع دائمًا**: لا حالة "مستحق" أو "غير مدفوع" — القيد الناتج
  دائمًا مدين حساب مصروف / دائن نقدية أو بنك بلا حالة وسيطة.
- **فرع المصروف اختياري صراحة**: أول كيان تجاري يسمح بعدم الانتماء لأي
  فرع (مصروف على مستوى المنشأة) — بعكس `Sale`/`Purchase` اللذين يشتقان
  فرعًا إلزاميًا من المستودع.
- **لا إدخال يدوي مزدوج، بتصميم الـController نفسه**:
  `JournalEntriesController` قراءة فقط — لا `POST`/`PATCH`/`DELETE`
  مُعرَّف على الإطلاق، وليس مجرد صلاحية غير ممنوحة.
- **العكس، لا التعديل، لتصحيح قيد**: `JournalService.reverseJournalEntry`
  ينشئ قيدًا جديدًا بمدين/دائن مقلوبين ويُعلّم الأصلي `reversed` — لا سطر
  قيد مُرحَّل يُعدَّل أو يُحذَف أبدًا.
- **الترميز الثابت (`Account.code`) هو مفتاح Account Mapping، وليس UUID**:
  `ACCOUNT_CODES` + `AccountingService.getAccountByCode` يحلان أي حساب
  ثابت معروف مسبقًا لكل منشأة على حدة وقت التنفيذ.
- **دليل الحسابات وفئات المصروفات يُزرَعان داخل معاملة التسجيل نفسها،
  بلا تغيير عقد Endpoint**: خطوة إضافية في `AuthService.registerCompany`
  فقط.
- **توقُّف متعمَّد عند تقييم المخزون (COGS)**: لا قرار FIFO/متوسط مرجّح
  بعد، فلا سطر مخزون/COGS في قيد البيع إطلاقًا — قرار موثَّق صراحة، وليس
  إغفالًا. راجع `docs/ACCOUNTING.md` "مؤجَّل".

### Known Limitations (موثَّقة صراحة، وليست ثغرات مسكوت عنها)
- **لا مرتجعات مشتريات**: إلغاء أمر شراء يعمل فقط قبل الاستلام؛ لا آلية
  لإبطال شراء مُستلَم بالفعل.
- **لا ذمم مدينة/دائنة كاملة**: `Sale`/`Purchase` يُرحَّلان لحساب إجمالي
  واحد (نقدية/بنك، ذمم دائنة) — لا رصيد لكل عميل/مورد على حدة، ولا خطوة
  "تحصيل من عميل" أو "دفع لمورد".
- **لا فترات مالية/إغلاق**: أي قيد قابل للترحيل بأثر رجعي فنيًا (لا حظر
  زمني)، رغم أن كل قيد فعلي في هذه المرحلة يُرحَّل لحظة وقوع العملية.
- **لا مرفق/إيصال للمصروف**: لا حقل تخزين ملف على `Expense`.
- **لا سير موافقة (Approval workflow)** لمصروفات تتجاوز حدًا معينًا.

### What is intentionally deferred (مؤجَّل عمدًا — وليس نسيانًا)
- تكلفة البضاعة المباعة (COGS) وتقييم المخزون (FIFO/متوسط مرجّح) — يحتاج
  قرارك أولًا (راجع `docs/ACCOUNTING.md` "مؤجَّل").
- ذمم مدينة/دائنة كاملة (Subledger لكل عميل/مورد + تقادم/Aging).
- مرتجعات المشتريات (`purchase_returns`) — يحتاج قرار سياسة استرجاع أولًا.
- الفترات المالية/إغلاقها، الأرصدة الافتتاحية المحاسبية.
- التسوية البنكية/النقدية الكاملة.
- طباعة/PDF/QR فعلي لفاتورة الشراء، والفوترة الإلكترونية ZATCA الكاملة.
- Qeedha Connector الفعلي (لا API مخترع، بانتظار عقد رسمي).
- التقارير المالية الكاملة (ميزانية عمومية، قائمة دخل)، Control Center،
  Website، اشتراكات فعلية — **لم تُبنَ ولن تُبنى في هذه المرحلة**.

### Commit
commit منفصل ونظيف لهذه المرحلة فقط، بدون تعديل أو إعادة كتابة أي commit
سابق — **pending final commit** (لم يُنفَّذ بعد وقت كتابة هذا التقرير).

### Push
NOT PUSHED

---

# Milestone 1 — Accounting Completion

**Status**: Completed

## ملخص: ما هذا الـMilestone وما ليس

طبقة قراءة/إدارة كاملة فوق أساس المرحلة 4 المحاسبي، بلا أي تغيير على
نقطة العبور الوحيدة لترحيل القيود (`JournalService.postJournalEntry`/
`reverseJournalEntry`): 4 تقارير مالية حية تقرأ مباشرة من دفتر الأستاذ
(ميزان مراجعة، دفتر أستاذ، أرباح وخسائر، ميزانية عمومية)، Subledger ذمم
مدينة/دائنة، أرصدة افتتاحية محاسبية (مُنفَّذة كقيد عادي، لا آلية جديدة)،
وفترات محاسبية قابلة للإقفال. لم يُبنَ في هذا الـMilestone: تكلفة
البضاعة المباعة (COGS)/تقييم المخزون (لا يزال قرارًا مفتوحًا)، بيع آجل
فعلي (AR سيبقى فارغًا هيكليًا حتى يُبنى)، خطوة "دفع لمورد" (AP لا
يتناقص)، قيد إقفال فترة فعلي يكنس صافي الدخل إلى Equity حقيقي (بند
"الأرباح المرحّلة غير المقفلة" حل عرض محسوب، وليس بديلًا) — كلها موثَّقة
صراحة أدناه تحت "Known Limitations" و`docs/ACCOUNTING.md` "مؤجَّل".

## ما تم إنجازه في هذه الدورة (Milestone 1)

- [x] `AccountingReportsService` + `AccountingReportsController`
      (`/accounting/reports/*`): Trial Balance، General Ledger (برصيد
      افتتاحي محسوب صحيحًا عند تمرير `dateFrom`)، Profit & Loss،
      Balance Sheet (ببند "أرباح مرحّلة غير مقفلة" محسوب، `computed:
      true`، يعالج غياب إجراء إقفال فترة فعلي بأسلوب محاسبي معياري).
      كل التقارير تقرأ حيًا من `JournalLine`/`JournalEntry` المُرحَّلة،
      بلا رصيد إجمالي مُخزَّن منفصل، وتحترم نطاق الفرع.
- [x] `SubledgerService` + `SubledgerController`
      (`/accounting/ar/customers`, `/accounting/ap/suppliers`): بنية AR
      حقيقية وعامة لكنها فارغة هيكليًا اليوم (لا بيع آجل)؛ AP مُعبَّأة
      فعليًا (تتراكم فقط، لا خطوة سداد بعد) — كلاهما موثَّق ومُختبَر
      صراحة كقيد معروف وليس خللًا.
- [x] `OpeningBalanceService` + `OpeningBalanceController`
      (`/accounting/opening-balance`): رصيد افتتاحي محاسبي (مختلف تمامًا
      عن الرصيد الافتتاحي للمخزون من المرحلة 2) مُنفَّذ كـ`JournalEntry`
      عادي عبر `JournalService.postJournalEntry` نفسها — لا جدول ولا
      آلية ترحيل جديدة. حارس تزامن بفهرس فريد جزئي على `journal_entries`
      يمنع أكثر من رصيد "نشط" واحد لكل منشأة حتى تحت سباق تزامن حقيقي.
- [x] عِلّة اكتُشفت وصُحِّحت: `JournalService.reverseJournalEntry` كان
      يُنشئ قيد العكس قبل تعليم الأصلي `reversed`، ما ينتهك عابرًا فهرس
      التزامن أعلاه — صُحِّح بإعادة الترتيب.
- [x] `FiscalPeriodsService` + `FiscalPeriodsController`
      (`/accounting/fiscal-periods`، جدول جديد `fiscal_periods` بـRLS
      FORCE كاملة): إنشاء/إقفال/إعادة فتح فترة، مع رفض تقاطع الفترات
      ورفض مدى تاريخ غير منطقي. `JournalService` يستدعي
      `assertTodayNotLocked` قبل أي ترحيل أو عكس — يمنع قيودًا *جديدة*
      فقط طالما اليوم داخل فترة مُقفلة، بلا أي أثر على قيد سابق.
- [x] 5 صلاحيات RBAC جديدة (`accounting.reports.view`,
      `accounting.ar.view`, `accounting.ap.view`,
      `accounting.opening_balance.manage`, `accounting.period.manage`)،
      تحديث الأدوار الافتراضية (Manager: تقارير+ذمم دون الإداري؛
      Accountant: الخمس كاملة؛ Cashier/Inventory Manager: بلا أي منها).
- [x] واجهة أمامية جديدة: `/reports` (تبويبات التقارير الأربعة)،
      `/receivables-payables` (تبويبا AR/AP مع Empty State يشرح فراغ AR
      صراحة)، تبويبان جديدان داخل `/accounting` الموجودة ("الأرصدة
      الافتتاحية"، "الفترات المحاسبية").
- [x] `test/milestone1.e2e-spec.ts`: 21 اختبارًا جديدًا (تقارير/ذمم/
      أرصدة افتتاحية/فترات/نطاق فرع/IDOR/RBAC) — **112/112 إجمالًا بلا
      أي تراجع** عن المراحل 1/2/2.1/3/4 (91 سابقًا)، مُتحقَّق فعليًا
      بتشغيل `npx jest --config ./test/jest-e2e.json --runInBand`.
- [x] Browser test (Playwright) يدوي حقيقي: تسجيل منشأة → زرع بيع/
      مصروف/شراء عبر الـAPI → التقارير الأربعة → AR/AP → الأرصدة
      الافتتاحية (إنشاء+عرض) → الفترات المحاسبية (إنشاء+عرض) — كل
      الخطوات نجحت بلا أخطاء console. عِلّة تنسيق حقيقية اكتُشفت
      وصُحِّحت: الأرقام كانت تُعرَض بأرقام هندية شرقية عبر
      `toLocaleString('ar-SA', ...)`، صُحِّحت إلى `.toFixed(2)` (أرقام
      غربية، متسقة مع كل صفحة أخرى بالتطبيق) في `ReportsPage.tsx` و
      `ReceivablesPayablesPage.tsx`.
- [x] توثيق مُحدَّث: `ACCOUNTING.md` (أقسام Milestone 1 كاملة + تحديث
      "مؤجَّل")، `DATABASE.md`, `API.md`, `SECURITY.md`, `TESTING.md`,
      `CHANGELOG.md`, `PROJECT_STATUS.md` (هذا الملف). لا ملف توثيق
      جديد منفصل — كل شيء ضمن `ACCOUNTING.md` الموجود.

## التقرير النهائي (بالصيغة المطلوبة)

**Reporting**: PASS (4 تقارير تقرأ حيًا من دفتر الأستاذ، بلا حالة
موازية؛ بند أرباح غير مقفلة محسوب وموسوم `computed: true` بوضوح)
**AR/AP Subledger**: PASS (بنية عامة صحيحة؛ AR فارغ هيكليًا موثَّق
كقيد وليس خللًا؛ AP مُعبَّأ فعليًا ومُختبَر)
**Opening Balance**: PASS (قيد عادي عبر نقطة العبور الوحيدة؛ حارس
تزامن بفهرس فريد جزئي؛ عِلّة ترتيب في `reverseJournalEntry` اكتُشفت
وصُحِّحت)
**Fiscal Periods**: PASS (إقفال يمنع قيودًا جديدة فقط، لا أثر على أي
قيد سابق؛ تقاطع/مدى غير منطقي مرفوضان)
**Double-Entry Integrity**: PASS (بلا أي تغيير — نفس الفرض من المرحلة 4)
**Branch Scope**: PASS (التقارير تحترم `BranchScopeService` نفسه، مُختبَر
صراحة بمحاسب مقيّد بفرع)
**Tenant Isolation**: PASS (RLS على `fiscal_periods` + فحوصات IDOR
صريحة على كل مورد جديد)
**RLS**: PASS (`FORCE ROW LEVEL SECURITY` على `fiscal_periods`)
**RBAC**: PASS (5 صلاحيات جديدة، مُختبَرة برفض 403 عند غيابها)
**Concurrency**: PASS (طلبان متزامنان حقيقيان لرصيد افتتاحي — نجاح
واحد فقط، تحقُّق مباشر عبر Prisma من صف واحد `posted`)
**Frontend**: PASS (`/reports`, `/receivables-payables`، تبويبا
الأرصدة الافتتاحية/الفترات داخل `/accounting`، متصلة بالكامل بالـAPI،
بلا بيانات وهمية)
**Browser Tests**: PASS (Playwright يدوي، مسار كامل، عِلّة تنسيق أرقام
حقيقية اكتُشفت وصُحِّحت)
**E2E**: PASS (112/112، `npx jest --config ./test/jest-e2e.json
--runInBand`)
**Build**: PASS (`nest build` + frontend `tsc --noEmit && vite build`،
بلا أخطاء)
**Documentation**: PASS (`ACCOUNTING.md` مُحدَّث بأقسام كاملة، 6 ملفات
أخرى مُحدَّثة)

**Tests**: 112/112 (91 سابقًا + 21 جديدة)

### Files Changed
- **Backend (جديد)**: `src/modules/accounting/accounting-reports
  .service.ts`, `accounting-reports.controller.ts`,
  `subledger.service.ts`, `subledger.controller.ts`,
  `opening-balance.service.ts`, `opening-balance.controller.ts`,
  `fiscal-periods.service.ts`, `fiscal-periods.controller.ts`، DTOs
  المرتبطة، `prisma/migrations/
  20260815220000_milestone1_accounting_completion/`, `prisma/
  migrations/20260815223000_milestone1_opening_balance_concurrency
  _guard/`, `test/milestone1.e2e-spec.ts`.
- **Backend (معدَّل)**: `prisma/schema.prisma` (`fiscal_periods`)،
  `src/modules/accounting/journal.service.ts` (استدعاء
  `assertTodayNotLocked` + إصلاح ترتيب `reverseJournalEntry`)،
  `src/modules/accounting/accounting.module.ts`،
  `src/modules/iam/constants/permissions.ts`,
  `src/modules/iam/constants/default-roles.ts`.
- **Frontend (جديد)**: `src/pages/ReportsPage.tsx`,
  `src/pages/ReceivablesPayablesPage.tsx`.
- **Frontend (معدَّل)**: `src/pages/AccountingPage.tsx` (تبويبا الأرصدة
  الافتتاحية/الفترات المحاسبية)، `src/App.tsx`,
  `src/components/Layout.tsx` (مسارات `/reports`,
  `/receivables-payables`).
- **Docs (معدَّل)**: `ACCOUNTING.md`, `DATABASE.md`, `API.md`,
  `SECURITY.md`, `TESTING.md`, `CHANGELOG.md`, `PROJECT_STATUS.md`
  (هذا الملف). لا ملف توثيق جديد.

### Database Changes
جدول جديد واحد (`fiscal_periods`، RLS FORCE كاملة) + فهرس فريد جزئي
جديد على `journal_entries` الموجودة أصلًا
(`journal_entries_one_active_opening_balance`) — عبر migration-ين
منفصلتين. لا تعديل ولا حذف لأي جدول من المراحل السابقة.

### API Changes
راجع `docs/API.md` قسم "Endpoints Milestone 1: Accounting Completion":
4 مسارات تحت `/accounting/reports`، 4 تحت `/accounting/ar`+`/ap`، 3 تحت
`/accounting/opening-balance`، 4 تحت `/accounting/fiscal-periods`. كلها
خلف نفس سلسلة الحراسة، بالإضافة لنطاق الفرع على التقارير/الذمم.

### Frontend Changes
صفحتان جديدتان (`/reports`, `/receivables-payables`) وتبويبان جديدان
داخل `/accounting` الموجودة — راجع `docs/ACCOUNTING.md` للتفصيل الكامل.
عِلّة تنسيق أرقام حقيقية اكتُشفت وصُحِّحت أثناء اختبار المتصفح (راجع
"ما تم إنجازه" أعلاه).

### Architectural Decisions (قرارات مسجَّلة)
- **طبقة استعلام مشتركة لكل التقارير**: `AccountingReportsService`
  تقرأ من نفس مصدر البيانات (`JournalLine`/`JournalEntry`) لكل التقارير
  الأربعة، فلا يمكن لأي تقرير أن ينحرف عن الآخر أو عن الدفتر.
- **بند "أرباح مرحّلة غير مقفلة" محسوب لا مُرحَّل**: حل عرض معياري
  ومُوسوم صراحة (`computed: true`)، وليس قيدًا مُختلَقًا — لا يُنشئ أي
  صف `JournalEntry`/`JournalLine`.
- **الرصيد الافتتاحي المحاسبي = `JournalEntry` عادي، لا جدول جديد**:
  يعيد استخدام نقطة العبور الوحيدة `JournalService.postJournalEntry`
  حرفيًا بدل بناء آلية ترحيل موازية.
- **فهرس فريد جزئي بدل قفل تطبيقي** لضمان رصيد افتتاحي "نشط" واحد —
  يعمل حتى تحت سباق تزامن حقيقي، لا فحص-ثم-كتابة يفتح نافذة سباق.
- **إقفال الفترة يمنع قيودًا جديدة فقط، ولا يمس أي قيد سابق أبدًا**:
  امتداد لمبدأ "عكس لا تعديل" الثابت منذ المرحلة 1، وليس استثناءً منه.
- **لا صلاحية `accounting.opening_balance.manage`/`period.manage`
  لـManager**: هاتان الصلاحيتان إداريتان بحتًا (تُغيّران سلوك ترحيل
  القيود مستقبلًا)، محصورتان بالمحاسب/المالك عمدًا — بعكس صلاحيتَي
  القراءة (`reports.view`/`ar.view`/`ap.view`) التشغيليتين المتاحتين
  لـManager أيضًا.

### Known Limitations (موثَّقة صراحة، وليست ثغرات مسكوت عنها)
- **AR فارغ هيكليًا اليوم**: لا بيع آجل في هذا الكود على الإطلاق — بنية
  Subledger صحيحة وعامة، لكن لا مصدر بيانات يملؤها حتى تُبنى قدرة بيع
  آجل فعلية (قرار عمل منفصل).
- **AP لا يتناقص أبدًا**: لا خطوة "دفع لمورد" — الرصيد يتراكم فقط مع كل
  استلام شراء جديد.
- **لا إجراء إقفال فترة فعلي**: إقفال فترة يمنع الترحيل فقط، ولا يُنشئ
  قيدًا يكنس صافي الدخل إلى Equity حقيقي — بند الميزانية العمومية حل
  عرض محسوب مؤقت.
- **لا تغيير على قرار COGS**: لا يزال مفتوحًا تمامًا كما في نهاية
  المرحلة 4.

### What is intentionally deferred (مؤجَّل عمدًا — وليس نسيانًا)
- تكلفة البضاعة المباعة (COGS) وتقييم المخزون (FIFO/متوسط مرجّح) — لم
  يُلمَس في هذا الـMilestone، يحتاج قرارك أولًا.
- بيع آجل (Credit Sale) فعلي — يحتاج قرار عمل قبل بناء أي قدرة، وهو ما
  يجعل AR مفيدًا فعليًا.
- خطوة "دفع لمورد" لتصفية/تقليل رصيد AP.
- إجراء إقفال فترة فعلي (قيد يكنس صافي الدخل إلى Equity حقيقي).
- مرتجعات المشتريات، التسوية البنكية/النقدية الكاملة، ZATCA الفعلي —
  لا تزال خارج النطاق كما في نهاية المرحلة 4.

### Commit
commit منفصل ونظيف لهذا الـMilestone فقط — **pending final commit** (لم
يُنفَّذ بعد وقت كتابة هذا التقرير).

### Push
NOT PUSHED

---

# Milestone 2 — Production Hardening + Demo/Staging Readiness

**Status**: Completed

## ملخص: ما هذا الـMilestone وما ليس

تصليب تشغيلي/أمني للنظام الموجود من نهاية Milestone 1، وتجهيز التهيئة
اللازمة لـDemo/Staging — **بلا أي منطق أعمال جديد وبلا أي تغيير على
المخطط**: CORS مبني على البيئة (fail-closed في production بدل مفتوح
دائمًا)، فحص صحة يُرجع `503` صحيحًا عند فشل قاعدة البيانات، Logging
مهيكل لا يُسجّل أي سرّ، إصلاح فجوتَي أداء حقيقيتين (ترقيم
`iam.listUsers`، حد أقصى لدفتر الأستاذ/كشوف الحسابات)، Dockerfiles +
docker-compose جذري (backend/frontend/postgres كخدمات منفصلة)، CI
(GitHub Actions)، سكربت بذر بيانات تجريبية آمن، وفي الواجهة الأمامية:
إصلاح فجوتَي RBAC حقيقيتين، إضافة حالات تحميل/خطأ لكل صفحة كانت تفتقدها،
معالجة انتهاء جلسة (401)، استجابة (Responsive) للشاشات الضيقة، قائمة
Onboarding مختصرة، وأول اختبارات آلية (Vitest) + أول مجموعة Playwright
مُلتزَمة في المستودع. **لم يُبنَ في هذا الـMilestone**: نشر Demo/Staging
فعلي (لا حساب استضافة/اعتمادات متاحة)، تنفيذ فعلي لـ`docker build`/
`docker compose up` أو تشغيل CI على runner حقيقي (كلاهما جاهز وغير
مُتحقَّق منه فعليًا)، واجهة "غير مخوَّل" مخصصة لأخطاء 403 — كلها موثَّقة
صراحة أدناه تحت "Known Limitations".

## ما تم إنجازه في هذه الدورة (Milestone 2)

- [x] **CORS مبني على البيئة**: `src/config/cors.config.ts`
      (`buildCorsOptions`/`assertCorsConfiguredForProduction`) يستبدل
      `app.enableCors()` بلا خيارات (كان يقبل/يعكس أي origin). متغيّر
      بيئة `CORS_ALLOWED_ORIGINS` (قائمة صريحة مفصولة بفواصل، لا `"*"`
      أبدًا في أي بيئة) — إلزامي في production (رفض إقلاع صريح بدونه،
      Fail-closed)، افتراضي لمنافذ Vite المحلية في development/test.
      `backend/.env.example`/`.env`/`.env.test` مُحدَّثة.
- [x] **Health check مُوسَّع**: `HealthController` يُرجع الآن
      `{status, timestamp, checks: {app, database}}` عند النجاح، ويُرجع
      **HTTP 503** (لا 200) عبر `ServiceUnavailableException` عند فشل
      فحص قاعدة البيانات — فحوص الحاوية/المنسّق التي تعتمد على status
      code فقط تعمل بشكل صحيح الآن. لا تسريب connection strings/تفاصيل
      داخلية.
- [x] **Logging مهيكل**: `RequestIdMiddleware` (معرّف ارتباط UUID لكل
      طلب، يعيد استخدام `x-request-id` الوارد إن وُجد، يُرجعه في رأس
      الاستجابة) + `LoggingInterceptor` (`APP_INTERCEPTOR` عام — سطر
      JSON واحد لكل طلب: `requestId`, `method`, `path`, `status`,
      `durationMs` فقط). لا رؤوس/معاملات استعلام/جسم طلب أو استجابة
      تصل إليه أبدًا — لا سرّ (كلمة مرور/JWT/refresh token/مفتاح API)
      يصل إلى Log عن طريق الخطأ.
- [x] **قرار موثَّق: `refresh_tokens` يبقى الاستثناء الوحيد من RLS** —
      راجَعنا صراحة إمكانية إضافة RLS له في هذا الـMilestone وقررنا
      الإبقاء على الاستثناء، لسبب معماري حقيقي (تناقض دائري "اكتشاف
      companyId قبل معرفته" لـ`POST /auth/refresh`، مطابق لمشكلة auth
      bootstrap عند login) وليس تكاسلًا. التفصيل الكامل في
      `docs/SECURITY.md` "قرار Milestone 2".
- [x] **إصلاحات أداء (بتدقيق backend مخصص)**: `IamService.listUsers`
      (`GET /iam/users`) كان `findMany` بلا `take` (غير محدود) — أصبح
      مُرقَّمًا كباقي كل Endpoint قائمة آخر في النظام
      (`QueryUsersDto` جديد، `IamController` يقبل `@Query()`)،
      الاستجابة تغيّرت من مصفوفة مسطّحة إلى `{data, meta}` القياسية —
      اختبار واحد في `test/app.e2e-spec.ts` عُدِّل ليطابق
      (`res.body.data`). دفتر الأستاذ العام
      (`AccountingReportsService`) وكشوف حساب العميل/المورد
      (`SubledgerService`) كانا بلا حد أعلى — أصبح لهما حد أقصى 1000
      سطر (`MAX_LEDGER_LINES`/`MAX_STATEMENT_LINES`، **حد وليس
      Pagination كاملة** — تُقرَأ كعرض مستمر واحد، تضييق مدى التاريخ هو
      الطريقة المقصودة لرؤية أكثر، تمامًا كأي برنامج محاسبي حقيقي). نفس
      التدقيق أكّد أن كل Endpoint قائمة آخر مُرقَّم أصلًا بشكل صحيح، أن
      استعلامات الحساب/العميل/المورد في التقارير/Subledger مُجمَّعة
      (batched) بلا N+1، وأنه لا يوجد أي حلقة N+1 حقيقية في النظام
      (حلقات سطور البيع/الشراء/القيد محدودة بحجم المصفوفة داخل المعاملة
      الواحدة، لا بحجم بيانات المنشأة).
- [x] **Docker**: `backend/Dockerfile` (multi-stage: deps → build →
      prod-deps → runtime، `node:20-slim` عمدًا بدل alpine — بنيات
      argon2/Prisma query engine الجاهزة أوثق على glibc)،
      `backend/.dockerignore`، `frontend/Dockerfile` (multi-stage: بناء
      Vite بـ`VITE_API_BASE_URL` مُضمَّن وقت البناء عبر build arg، ثم
      nginx لخدمة الملفات الثابتة)، `frontend/nginx.conf` (SPA fallback
      routing). لا قاعدة بيانات داخل أي صورة. Migrations **لا** تُشغَّل
      تلقائيًا عند بدء الحاوية في أي مكان — خطوة منفصلة صريحة دائمًا
      (`prisma migrate deploy`).
- [x] **سكربت بذر بيانات تجريبية**: `backend/scripts/demo-seed.ts` —
      يُنشئ منشأة تجريبية واحدة عبر Endpoints الحقيقية فقط (لا إدخال DB
      مباشر، فيمر بكل قيد فعلي: بذر دليل الحسابات، الأدوار الافتراضية،
      إلخ): 4 منتجات برصيد افتتاحي، عميلان، موردان، شراء واحد مُستلَم،
      بيع POS واحد مكتمل. كل اسم مُعلَّم صراحة "(Demo)" وكل بريد
      `@qeedha-demo.local` — لا بيانات شخصية حقيقية. آمن لإعادة التشغيل
      (كل تشغيل يُنشئ منشأة جديدة بلاحقة عشوائية، لا يمس تشغيلات سابقة).
      سكربت `demo:seed` جديد في `package.json`؛ `tsconfig.build.json`
      يستثني `scripts/` من بناء الإنتاج الآن. **نُفِّذ فعليًا ضد backend
      حقيقي خلال هذه الجلسة ونجح** (`✔ Demo company created`، 4 منتجات،
      عميلان، موردان، شراء مُستلَم، بيع POS مكتمل، بيانات دخول
      تجريبية مطبوعة).
- [x] **إصلاحات RBAC في الواجهة الأمامية (بتدقيق frontend مخصص قرأ كل
      الصفحات الـ16)**: `DashboardPage.tsx` لم تكن مُقيَّدة بأي صلاحية
      على الإطلاق وكانت تجلب بطاقاتها عبر `Promise.all` (فشل صلاحية
      واحدة يُفرغ اللوحة بالكامل) — أصبحت كل بطاقة مُقيَّدة بصلاحيتها
      الخاصة وتُجلَب عبر `Promise.allSettled` (فشل جزئي يعرض ما نجح
      فقط). `InvoicesPage.tsx` لم تكن تتحقق من `hasPermission` إطلاقًا —
      أصبحت مُقيَّدة بـ`invoices.read`.
- [x] **حالات تحميل/خطأ جديدة**: 9+ صفحات كان جلب البدء (mount fetch)
      فيها بلا `try/catch` أو مؤشر تحميل (أزرار الإنشاء/التعديل/الحذف
      فقط كانت مُجهَّزة سابقًا) — `ProductsPage.tsx`, `PartyPage.tsx`
      (العملاء/الموردون)، `CatalogPage.tsx`, `InventoryPage.tsx`,
      `PurchasesPage.tsx`, `ExpensesPage.tsx`, `AccountingPage.tsx`
      (تبويبا الحسابات/القيود)، `PosPage.tsx` (جلب البدء + بحث
      المنتج)، `ReportsPage.tsx` (قائمة الحسابات في تبويب دفتر
      الأستاذ)، `InvoicesPage.tsx` — كلها أصبحت تعرض "...جارٍ التحميل"
      أثناء الجلب و`ErrorBanner` عند الفشل.
- [x] **معالجة انتهاء الجلسة (401)**: `SESSION_EXPIRED_EVENT`
      (`frontend/src/api/client.ts`) يُطلَق عبر `window.dispatchEvent`
      عندما يفشل تجديد التوكن (الجلسة منتهية فعليًا من طرف الخادم).
      `AuthProvider` (`frontend/src/state/auth.tsx`) يستمع له الآن
      ويُفرغ `me`، فيعيد `RequireAuth` (`App.tsx`) التوجيه إلى `/login`
      بدل ترك شاشة مُصادَق عليها باليات تفشل فيها كل الطلبات التالية
      صامتة.
- [x] **استجابة (Responsive)**: `Layout.tsx` أُعيدت كتابته بالكامل —
      الشريط الجانبي أصبح درج off-canvas تحت حد `md` (زر همبرغر في
      شريط علوي)، بلا تغيير على الشريط الجانبي الدائم الظهور فوق `md`.
      نحو 20 جدول بيانات عبر التطبيق (Products, Inventory,
      Customers/Suppliers, Purchases×2, Expenses, Accounting×5,
      Reports×5, Receivables/Payables×2, POS, Invoices) لُفَّت بـ
      `<div className="overflow-x-auto">` — تمرير أفقي بدل كسر تخطيط
      الصفحة. ليست إعادة تصميم — نفس المكوّنات، نفس التنسيق، مجرد لفّ.
- [x] **Onboarding**: `OnboardingChecklist.tsx` (جديد) — قائمة من 8
      خطوات على لوحة التحكم (منشأة/فرع/مستودع تظهر مكتملة دائمًا لأن
      `registerCompany` تُنشئها ذرّيًا؛ منتج/مخزون/عميل/مورد/أول بيع
      تُتحقَّق عبر استدعاءات API حقيقية)، مُقيَّدة بصلاحية كل خطوة على
      حدة، قابلة للإخفاء (تُحفظ في `localStorage`)، تختفي تلقائيًا عند
      اكتمال كل خطوة ظاهرة. **ليست** معالج (wizard) متعدد الشاشات — نطاق
      مُصغَّر عمدًا حسب توجيه المرحلة.
- [x] **أول اختبارات آلية للواجهة الأمامية (Vitest)**: `vite.config.ts`
      (قسم `test`، `environment: 'jsdom'`)، `src/test/setup.ts`، وثلاثة
      ملفات تحت `src/pages/__tests__/` (`LoginPage.test.tsx`,
      `RegisterPage.test.tsx`, `DashboardPage.test.tsx`) — **7
      اختبارات، مُتحقَّقة فعليًا بتشغيل `npx vitest run`: 7/7 ناجحة**.
      سكربتا `test`/`test:watch` جديدان. تستخدم `@testing-library/react`
      + `@testing-library/user-event` + `vitest`.
- [x] **مجموعة Playwright مُلتزَمة (تستبدل السكربتات المؤقتة اليدوية من
      المراحل السابقة)**: `playwright.config.ts`, `e2e/helpers.ts`,
      `e2e/golden-path.spec.ts` (الرحلة الكاملة: تسجيل → منتج → مخزون →
      عميل → مورد → شراء → استلام → بيع POS → دفعة → فاتورة → مصروف →
      محاسبة → تقارير → ذمم → خروج → دخول مجددًا)،
      `e2e/tenant-isolation.spec.ts` (تسجيل منشأتين والتحقق أن منتج
      المنشأة الأولى غير مرئي للثانية عبر الواجهة الحقيقية). سكربت
      `test:e2e` جديد. **نُفِّذت المجموعتان فعليًا ضد الحزمة الحقيقية
      الكاملة خلال هذه الجلسة ونجحتا (2/2)** — تشغيل متصفح آلي حقيقي،
      وليس وصف نيّة.
- [x] **Docker Compose جذري**: `docker-compose.yml` (جديد، جذر
      المستودع — منفصل تمامًا عن `backend/docker-compose.yml` الموجود
      أصلًا الذي لا يزال يُشغِّل Postgres للتطوير المحلي فقط دون تغيير)
      ينسّق ثلاث خدمات منفصلة: `postgres`, `backend` (يُبنى من
      `backend/Dockerfile`), `frontend` (يُبنى من `frontend/Dockerfile`،
      يُخدَم عبر nginx) — Postgres لا يُدمَج أبدًا داخل صورة التطبيق.
      يتطلب `.env` جذري جديد (`POSTGRES_PASSWORD`, `VITE_API_BASE_URL`)
      — **منفصل عن `backend/.env` ولا يتزامن معه تلقائيًا**، موثَّق
      صراحة كشيء يجب أن يبقيه من ينشر متسقًا يدويًا (اسم المستخدم
      `qeedha_app` في خدمة Postgres بملف compose مقابل أيًا كان في
      `DATABASE_URL` الخاص بـ`backend/.env`).
- [x] **CI/CD**: `.github/workflows/ci.yml` (جديد) — ثلاث jobs:
      `backend` (حاوية خدمة Postgres، تثبيت، lint، typecheck، build،
      migrate، إنشاء دور `qeedha_auth_lookup` عبر سكربتات manual-sql
      الموجودة أصلًا، بذر، تشغيل مجموعة e2e الخلفية كاملة)، `frontend`
      (تثبيت، lint، build، vitest)، `e2e` (حاوية Postgres منفصلة، يبني
      ويشغّل backend الحقيقي، يثبّت متصفحات Playwright عبر `npx
      playwright install --with-deps chromium`، يشغّل مجموعة Playwright
      المُلتزَمة ضده، يرفع تقرير HTML كـartifact عند الفشل).
      **تنبيه صريح**: تحقَّق من صحة الـYAML نحويًا فقط
      (`python3 -c "import yaml; yaml.safe_load(...)"` نجح) — **لم
      يُشغَّل فعليًا على أي GitHub Actions runner حقيقي على الإطلاق**
      (بيئة التطوير هذه لا تملك وصولًا لتشغيله). لا يُدَّعى أنه "ينجح
      على CI".
- [x] **Docker لم يُبنَ فعليًا في هذه الجلسة**: بيئة التطوير هذه تملك
      أداة `docker` CLI لكن بلا daemon يعمل، وتشغيل واحد محظور بصلاحيات
      الـsandbox (`dockerd` يفشل بـ"Operation not permitted" عند
      `ulimit`، مُتحقَّق منه). كل Dockerfile وملف compose كُتبا بعناية
      باتّباع أنماط معروفة وموثَّقة، لكن **`docker build`/`docker
      compose up` لم يُنفَّذا أو يُتحقَّق منهما فعليًا في هذه الجلسة**.
      مذكور صراحة في تعليقات كل Dockerfile وفي `docs/DEPLOYMENT.md`
      "القيود المعروفة".
- [x] **housekeeping على مستوى الجذر**: `.gitignore` جذري جديد (لم يكن
      موجودًا قبله — فقط `backend/.gitignore`/`frontend/.gitignore`
      كانا موجودين)، `.env.example` جذري جديد.
- [x] توثيق جديد: `docs/DEPLOYMENT.md`, `docs/DEMO.md`؛ توثيق مُحدَّث:
      `SECURITY.md`, `API.md`, `TESTING.md`, `MODULES.md`,
      `DATABASE.md`, `DOMAIN_MODEL.md` (ملاحظة "لا تغييرات" في
      الأخيرين)، `CHANGELOG.md`, `PROJECT_STATUS.md` (هذا الملف)،
      `backend/README.md`, `frontend/README.md`.

## التقرير النهائي (بالصيغة المطلوبة)

**CORS**: PASS (مبني على البيئة، Fail-closed في production، لا `"*"`
في أي بيئة)
**Health Check**: PASS (`503` صحيح عند فشل قاعدة البيانات، لا تسريب
تفاصيل داخلية)
**Structured Logging**: PASS (سطر JSON واحد لكل طلب، لا رؤوس/query/body
تصل إليه أبدًا)
**Refresh Token RLS Decision**: PASS (قرار موثَّق صراحة بعدم التنفيذ،
سبب معماري حقيقي — راجع `docs/SECURITY.md`)
**Performance Fixes**: PASS (`iam.listUsers` مُرقَّم، حد أقصى لدفتر
الأستاذ/كشوف الحسابات، تأكيد عدم وجود N+1 حقيقي في أي مكان آخر)
**Docker**: PASS كتهيئة (Dockerfiles + compose مكتوبة بعناية) — **غير
مُختبَرة فعليًا** (`docker build`/`docker compose up` لم يُنفَّذا، لا
daemon في بيئة التطوير)
**CI/CD**: PASS كتهيئة (YAML صحيح نحويًا، ثلاث jobs كاملة) — **غير
مُشغَّل فعليًا** على أي GitHub Actions runner حقيقي
**Demo Seed Script**: PASS (نُفِّذ فعليًا ضد backend حقيقي ونجح، بيانات
Demo واضحة، آمن لإعادة التشغيل)
**Frontend RBAC Fixes**: PASS (`DashboardPage`/`InvoicesPage`، مُختبَر
آليًا عبر Vitest)
**Frontend Loading/Error States**: PASS (9+ صفحة، نمط موحّد)
**Frontend Session Expiry (401)**: PASS (`SESSION_EXPIRED_EVENT` →
تسجيل خروج تلقائي)
**Frontend Responsive**: PASS (درج off-canvas تحت `md`، ~20 جدول
بـ`overflow-x-auto`)
**Frontend Onboarding**: PASS (قائمة 8 خطوات مُصغَّرة، مُقيَّدة
بالصلاحيات، قابلة للإخفاء)
**Frontend Unit/Component Tests (Vitest)**: PASS (7/7، مُتحقَّق فعليًا)
**Playwright Suite**: PASS (مُلتزَمة في المستودع، 2/2 نجحت فعليًا ضد
الحزمة الحقيقية)
**E2E الخلفية**: PASS (112/112، بلا تراجع، `npx jest --config
./test/jest-e2e.json --runInBand`)
**Build**: PASS (`nest build` + frontend `tsc --noEmit && vite build`،
بلا أخطاء)
**Lint**: PASS (`eslint . --ext .ts` / `--ext ts,tsx` — 0 أخطاء في
الطرفين)
**Typecheck**: PASS (`tsc --noEmit` — 0 أخطاء في الطرفين)
**Database Changes**: PASS (لا شيء — لا Migration جديدة، تأكيد صريح)
**Documentation**: PASS (ملفان جديدان، 7 ملفات مُحدَّثة، الـREADMEان
مُحدَّثان)
**Honesty on Unverified Items**: PASS (Docker/CI/Demo-Staging الفعلي
موثَّقة صراحة كغير مُنفَّذة/مُختبَرة، لا ادّعاء زائف في أي مكان)

**Tests**: 112/112 خلفية (بلا تراجع) + 7/7 Vitest جديدة + Playwright
2/2 (golden-path + tenant-isolation) — كلها مُتحقَّقة فعليًا بالتشغيل
خلال هذه الجلسة.

### Files Changed
- **Backend (جديد)**: `src/config/cors.config.ts`,
  `src/common/middleware/request-id.middleware.ts`,
  `src/common/interceptors/logging.interceptor.ts`,
  `src/modules/iam/dto/query-users.dto.ts`, `Dockerfile`,
  `.dockerignore`, `scripts/demo-seed.ts`.
- **Backend (معدَّل)**: `src/main.ts`, `src/config/env.validation.ts`
  (`CORS_ALLOWED_ORIGINS`)، `src/modules/health/health.controller.ts`,
  `src/app.module.ts`, `src/modules/iam/iam.service.ts`,
  `src/modules/iam/iam.controller.ts`,
  `src/modules/accounting/accounting-reports.service.ts`
  (`MAX_LEDGER_LINES`)، `src/modules/accounting/subledger.service.ts`
  (`MAX_STATEMENT_LINES`)، `test/app.e2e-spec.ts` (اختبار واحد)،
  `package.json` (`demo:seed`)، `tsconfig.build.json` (استثناء
  `scripts/`)، `.env.example`, `.env`, `.env.test`
  (`CORS_ALLOWED_ORIGINS`).
- **Frontend (جديد)**: `src/components/OnboardingChecklist.tsx`,
  `src/test/setup.ts`, `src/pages/__tests__/LoginPage.test.tsx`,
  `src/pages/__tests__/RegisterPage.test.tsx`,
  `src/pages/__tests__/DashboardPage.test.tsx`, `playwright.config.ts`,
  `e2e/helpers.ts`, `e2e/golden-path.spec.ts`,
  `e2e/tenant-isolation.spec.ts`, `Dockerfile`, `nginx.conf`.
- **Frontend (معدَّل)**: `src/api/client.ts`
  (`SESSION_EXPIRED_EVENT`)، `src/state/auth.tsx` (الاستماع للحدث)،
  `src/components/Layout.tsx` (إعادة كتابة كاملة — درج off-canvas)،
  `src/pages/DashboardPage.tsx` (RBAC + `Promise.allSettled` +
  Onboarding)، `src/pages/InvoicesPage.tsx`,
  `src/pages/ProductsPage.tsx`, `src/pages/PartyPage.tsx`,
  `src/pages/CatalogPage.tsx`, `src/pages/InventoryPage.tsx`,
  `src/pages/PurchasesPage.tsx`, `src/pages/ExpensesPage.tsx`,
  `src/pages/AccountingPage.tsx`, `src/pages/PosPage.tsx`,
  `src/pages/ReportsPage.tsx` (حالات تحميل/خطأ + جداول
  `overflow-x-auto` عبر ~20 جدولًا إضافيًا في صفحات أخرى)،
  `vite.config.ts` (قسم `test`)، `package.json` (`test`,
  `test:watch`, `test:e2e`).
- **جذر المستودع (جديد)**: `docker-compose.yml`, `.env.example`,
  `.gitignore`, `.github/workflows/ci.yml`.
- **Docs (جديد)**: `DEPLOYMENT.md`, `DEMO.md`.
- **Docs (معدَّل)**: `SECURITY.md`, `API.md`, `TESTING.md`,
  `MODULES.md`, `DATABASE.md`, `DOMAIN_MODEL.md`, `CHANGELOG.md`,
  `PROJECT_STATUS.md` (هذا الملف)، `backend/README.md`,
  `frontend/README.md`.

### Database Changes
**لا شيء** — لا Migration جديدة، لا جدول جديد، لا عمود جديد. تأكيد
صريح مطلوب حسب نطاق هذا الـMilestone (بنية تحتية/تشغيلية بحتة).

### API Changes
لا Endpoint جديد. تغييران على صيغة استجابة موجودة فقط:
`GET /api/v1/iam/users` أصبح `{data, meta}` مُرقَّم بدل مصفوفة مسطّحة؛
`GET /api/v1/health` يُرجع الآن `checks` ويُرجع `503` عند فشل قاعدة
البيانات بدل `200` دائمًا. راجع `docs/API.md`.

### Frontend Changes
لا صفحة جديدة (باستثناء `OnboardingChecklist` كمكوّن، لا صفحة/مسار
جديد). كل التغيير على صفحات موجودة: RBAC، حالات تحميل/خطأ، استجابة
للشاشات الضيقة، معالجة انتهاء جلسة. راجع "ما تم إنجازه" أعلاه للقائمة
الكاملة.

### Architectural Decisions (قرارات مسجَّلة)
- **`refresh_tokens` يبقى الاستثناء الوحيد من RLS** — راجَعنا صراحة
  وقررنا الإبقاء، سبب معماري حقيقي (تناقض دائري)، مُرشَّح واضح لمرحلة
  "إدارة الجلسات النشطة" مستقبلية. التفصيل الكامل في `docs/SECURITY.md`.
- **`node:20-slim` لا alpine** في كل Dockerfile عمدًا — argon2 (native
  module) وPrisma query engine أوثق على glibc من musl بلا أدوات بناء
  إضافية.
- **Migrations لا تُشغَّل تلقائيًا عند بدء أي حاوية** — خطوة منفصلة
  صريحة دائمًا (`prisma migrate deploy`)، تمامًا كالتطوير المحلي.
- **حد أقصى (1000 سطر)، لا Pagination كاملة**، لدفتر الأستاذ/كشوف
  الحسابات — تُقرَأ كعرض مستمر واحد؛ تضييق مدى التاريخ هو الطريقة
  المقصودة لرؤية أكثر، تمامًا كأي برنامج محاسبي حقيقي.
- **`VITE_API_BASE_URL` يُضمَّن وقت بناء صورة الواجهة الأمامية، لا وقت
  التشغيل** — Vite يُضمِّن متغيرات البيئة داخل الحزمة، فلا يمكن تغييره
  بعد بناء الصورة دون إعادة بناء.
- **`.env` الجذري و`backend/.env` ملفان منفصلان لا يتزامنان تلقائيًا**
  — قرار متعمَّد لإبقاء `docker-compose.yml` بسيطًا، موثَّق صراحة كمسؤولية
  يدوية على من ينشر في `docs/DEPLOYMENT.md`.
- **403 يبقى بلا واجهة "غير مخوَّل" مخصصة** — يُعرَض كرسالة خطأ عامة
  ضمن حالة الخطأ الموجودة لكل صفحة، قرار نطاق لهذا الـMilestone وليس
  إغفالًا.

### Known Limitations (موثَّقة صراحة، وليست ثغرات مسكوت عنها)
- **Docker لم يُبنَ/يُختبَر فعليًا**: لا daemon Docker متاح في بيئة
  التطوير هذه (`dockerd` يفشل بـ"Operation not permitted"). كل ملف
  مكتوب بعناية باتّباع أنماط معروفة، لكن `docker build`/`docker compose
  up` غير مُتحقَّق منهما فعليًا.
- **CI لم يُشغَّل فعليًا على GitHub Actions**: تحقُّق من صحة YAML
  النحوية فقط.
- **لا نشر Demo/Staging فعلي موجود**: لا حساب استضافة/اعتمادات كانت
  متاحة في هذه الجلسة — كل ما هو موجود تهيئة جاهزة (Dockerfiles،
  compose، CI)، وليس نشرًا فعليًا. لا ادّعاء بخلاف ذلك في أي مكان.
- **403 بلا واجهة مخصصة**: يُعرَض كخطأ عام، لا تمييز بصري عن أخطاء أخرى.
- **`refresh_tokens` لا يزال بلا RLS**: قرار موثَّق، ليس نسيانًا — راجع
  `docs/SECURITY.md`.

### Commit
commit منفصل ونظيف لهذا الـMilestone فقط — **pending final commit** (لم
يُنفَّذ بعد وقت كتابة هذا التقرير).

### Push
NOT PUSHED

## ما لم يبدأ بعد (بانتظار إذنك للانتقال)

المرحلة القادمة (وفق `ROADMAP.md`، بعد إعادة تجزئة نطاق المراحل الفعلي عن
التصميم الأصلي — راجع `docs/DATABASE.md` لكل "انحراف موثَّق") — لا كود لأي
من وحداتها بعد. **لن يبدأ التنفيذ إلا بعد موافقتك الصريحة، ولن يُبدأ
تلقائيًا.**

## قرارات تحتاج نقاشًا معك لاحقًا (مؤجَّلة عمدًا، ليست الآن)

- خوارزمية تقييم المخزون (FIFO/Weighted Average) — قبل بناء أي قيد COGS.
- سياسة الذمم المدينة/الدائنة الكاملة (Subledger لكل عميل/مورد، شروط
  ائتمان، تقادم).
- سياسة مرتجعات المشتريات — قبل بناء `purchase_returns`.
- سياسة مرتجعات المبيعات (لا تزال مؤجَّلة من المرحلة 3).
- الحاجة الفعلية لورديات الكاشير قبل بناء `cash_sessions`.
- استراتيجية Offline-first الكاملة (طابور محلي، حل تعارض).
- الموجة/الحد المالي المطبَّق لـZATCA Phase 2.
- عقد API الفعلي لقيّدها (Endpoints, Auth, Fields) — بانتظار توثيق منك.

## كيف تتحقق من الحالة الحالية محليًا

Backend: `cd backend && npm install && npx prisma migrate deploy && npm run
prisma:seed && npm run start:dev`، ثم `npm run test:e2e` (**139/139**
حاليًا) و`npx jest src` (**4/4** Unit، أول اختبارات Unit في الـBackend).
Frontend: `cd frontend && npm install && npm run dev` (يتطلب backend يعمل
على `http://localhost:3000`)، ثم `npm run test` (**11/11** Vitest) و
`npm run test:e2e` (Playwright، **4/4** — يتطلب backend يعمل ومهاجَر
ومزروع).
Docker/Demo/DEPLOYMENT: راجع `docs/DEPLOYMENT.md` و`docs/DEMO.md`
(Milestone 2) — تذكَّر أن Docker/CI جاهزان لكن غير مُختبَرين فعليًا بعد.
Excel Import: راجع `docs/IMPORT_EXCEL.md` للتصميم الكامل (Milestone 3).
ZATCA: راجع `docs/ZATCA.md` — Phase 1 (QR) فقط مُنفَّذ (Milestone 4)،
Phase 2 بالكامل Blocked.

# Milestone 3 — Excel Import

**Status**: Completed

## ملخص: ما هذا الـMilestone وما ليس

نظام استيراد بيانات جماعي حقيقي وجاهز للاستخدام من ملفات Excel (.xlsx)،
مبني بالكامل فوق الخدمات الموجودة أصلًا (`ProductsService`،
`CatalogService`، `CustomersService`، `SuppliersService`،
`InventoryService.setOpeningBalance`) — **بلا أي منطق أعمال موازٍ جديد،
وبلا تغيير على أي جدول موجود**. بالإضافة إلى File Storage abstraction
عامة وقابلة لإعادة الاستخدام (`backend/src/modules/storage`)، مُنفَّذة
محليًا بالكامل ومُصمَّمة (لا مُنفَّذة) لمزوّد S3-compatible لاحقًا. **لم
يُبنَ في هذا الـMilestone**: ZATCA، Qeedha Connector الحقيقي، Control
Center، Website، Subscription/Billing، إعادة بناء POS/Accounting/
Inventory/Auth — كلها ممنوعة صراحة بموجب نطاق هذه المرحلة ولم تُلمَس.

## ما تم إنجازه

- [x] **File Storage abstraction**: `FileStorageProvider` interface +
      `LocalFileStorageProvider` (المُنفَّذ الوحيد، مُتحقَّق منه بالتشغيل
      الفعلي) + `StorageService` (الواجهة الوحيدة المسموحة لبقية النظام).
      مزوّد S3-compatible **مصمَّم له الواجهة لكن غير مُنفَّذ** — لا
      اعتمادات S3 حقيقية متاحة لبنائه واختباره بصدق. مفاتيح التخزين
      مولَّدة من الخادم دائمًا (`imports/<companyId>/<jobId>/source.xlsx`)
      — Path traversal غير ممكن بنيويًا، لا بفحص فقط.
- [x] **Import Job state machine كامل**: `ImportJob` (جدول جديد واحد،
      RLS كأي جدول تجاري آخر) بحالات `uploaded → analyzing → ready →
      validating → validated → importing → completed`، بالإضافة
      `failed`/`cancelled`. التدفق الكامل Upload → Detect → Map → Preview
      → Validate → Confirm → Import → Audit مُنفَّذ ومُختبَر e2e بالكامل.
- [x] **7 أنواع بيانات مدعومة**: `products`، `barcodes`، `categories`،
      `units`، `customers`، `suppliers`، `opening_stock` — تعريفات الحقول
      المطلوبة/الاختيارية لكل نوع في مصدر حقيقة واحد
      (`import-field-defs.ts`) يستهلكه الـBackend والـFrontend معًا.
- [x] **اكتشاف واقتراح ربط أعمدة تلقائي** (`suggestMapping`) — اقتراح
      فقط، يراجعه/يعدّله المستخدم دائمًا قبل أي معاينة أو تحقق.
- [x] **Preview بلا أي كتابة فعلية** — مُختبَر e2e صراحة (لا يظهر المنتج
      في `GET /products` قبل Confirm).
- [x] **تحقق شامل**: حقول مطلوبة، أنواع البيانات، تكرار داخل الملف نفسه
      (Set أثناء المرور)، تكرار مقابل بيانات موجودة فعليًا (استعلام
      مجمَّع واحد `IN(...)` — لا N+1)، ملكية مراجع التصنيف/العلامة/
      الوحدة لنفس المنشأة (بلا إنشاء تلقائي لمرجع غير موجود — قرار أمان
      متعمَّد)، صحة الرصيد الافتتاحي.
- [x] **فشل صف واحد لا يُفسِد الاستيراد**: كل صف يُستورَد في معاملة
      منفصلة؛ صف فاشل يُسجَّل كخطأ محدَّد (رقم الصف + الحقل + الرسالة)
      دون إيقاف بقية الصفوف الصالحة — نتيجة نهائية دقيقة (مستورَد/فاشل)
      دائمًا، لا فساد صامت.
- [x] **Idempotency على مستويين**: `clientReferenceId` عند إنشاء المهمة
      (نفس نمط Sale/Purchase/Expense)، و`confirm` مؤمَّن على مستوى المهمة
      نفسها (استدعاؤه مرتين لا يستورد الصفوف مرتين) — كلاهما مُختبَر e2e.
- [x] **RBAC**: صلاحيتان جديدتان فقط (`import.read`/`import.create`) في
      نظام RBAC الموجود أصلًا، بلا أي تعديل على `PermissionsGuard`.
      Owner/Manager/Inventory Manager تملكهما، Accountant `import.read`
      فقط، Cashier لا تملك أيًا منهما.
- [x] **عزل مستأجرين + IDOR**: `import_jobs` بنفس نمط RLS، ومحاولة الوصول
      لمهمة استيراد منشأة أخرى (Get/Mapping/Preview/Validate/Confirm)
      تُرفَض بـ404 في كل حالة — مُختبَر e2e.
- [x] **نطاق الفروع/المستودعات**: استيراد رصيد افتتاحي يمر عبر نفس فحص
      `BranchScopeService` الذي يفرضه `InventoryService.setOpeningBalance`
      أصلًا — عضو مقيَّد بفرع لا يستطيع استيراد رصيد لمستودع خارج فرعه،
      حتى لو كان مملوكًا لنفس المنشأة — مُختبَر e2e.
- [x] **أمان الملف**: بصمة ZIP حقيقية (لا اعتماد على الامتداد/
      Content-Type)، حد حجم (5MB) وعدد صفوف (5000) صريحان، حماية
      Formula/CSV injection (`sanitizeImportedText`)، لا Endpoint لتنزيل
      ملف خام، لا محتوى ملفات في أي Log.
- [x] **Audit كامل**: رفع/ربط/تحقق/بدء وانتهاء الاستيراد/إلغاء — كل
      عملية حسّاسة مُدقَّقة (من، متى، أي منشأة، أي نوع، كم صف، النتيجة)،
      بالإضافة لتدقيق كل صف يُنشأ فعليًا عبر تدقيق الخدمة المستهدفة نفسها.
- [x] **واجهة أمامية حقيقية متصلة**: `ImportPage.tsx` (`/import`) — لا
      بيانات وهمية، تتبع حالة `ImportJob` الحقيقية عبر كل خطوة، RBAC
      gating، Loading/Error/Success لكل خطوة، متوافقة مع RTL والتصميم
      المتجاوب من Milestone 2، بلا إعادة بناء لبنية الواجهة الأمامية.
- [x] **اختبارات**: 22 اختبار e2e خلفي جديد (`imports.e2e-spec.ts`) +
      اختبارا Vitest جديدان (`ImportPage.test.tsx`) + Playwright جديد
      (`excel-import.spec.ts`، بملف `.xlsx` حقيقي مُلتزَم بالمستودع) — كلها
      **نُفِّذت فعليًا ونجحت**، لا وصف نيّة.

## قرارات معمارية مسجَّلة

- **لا جدول `import_job_rows` منفصل**: نتيجة كل صف تُعاد حسابها من الملف
  المخزَّن عند كل خطوة، والنتيجة النهائية (محدودة العدد، أول 500 خطأ)
  تُخزَّن كـJSON على `import_jobs` نفسه — تبسيط متعمَّد لتجنّب صف قاعدة
  بيانات مستقل لكل سطر Excel (حتى 5000 صف لكل ملف).
- **لا تحديث سجل موجود عبر الاستيراد (Update)** — فقط إنشاء (Create). SKU/
  مرجع مكرر مع بيانات موجودة **يُرفَض كخطأ**، لا يُحدِّث السجل القائم.
  قرار تبسيط متعمَّد يتجنّب مخاطر Overwrite الأعلى بكثير التي يحملها
  التحديث الجماعي الصامت.
- **مراجع الأسماء (تصنيف/علامة/وحدة) لا تُنشَأ تلقائيًا** إن لم توجد —
  تُرفَض كخطأ بدل افتراض mapping غير آمن.
- **مزوّد S3-compatible مصمَّم له، غير مُنفَّذ** — لا اعتمادات حقيقية
  لاختباره بصدق في هذه الجلسة.
- **لا Queue/معالجة خلفية** — الملفات صغيرة بما يكفي (5MB/5000 صف) لتُعالَج
  ضمن دورة الطلب/الاستجابة نفسها، تجنبًا لتعقيد غير ضروري في هذه المرحلة.

## Tests

**134/134** خلفية (112 سابقة + 22 جديدة، صفر تراجع) + **9/9** Vitest (7 +
2 جديدة) + Playwright **3/3** (golden-path + tenant-isolation +
excel-import) — كلها مُتحقَّقة فعليًا بالتشغيل.

## Push
NOT PUSHED

---

# Milestone 4 — ZATCA E-Invoicing Readiness

**Status**: Completed (ضمن النطاق القابل للتنفيذ بدون اعتمادات خارجية)

## ملخص: ما هذا الـMilestone وما ليس

جعل qeedha B جاهزًا معماريًا وفنيًا لمتطلبات ZATCA، دون اختراع أي متطلب
قانوني/تقني غير مؤكَّد. **المُنفَّذ فعليًا**: توليد رمز QR محلي (TLV،
Base64) وفق مواصفة ZATCA Phase 1 المنشورة على كل فاتورة، عبر طبقة
`EInvoiceService` معزولة تمامًا (السطر الوحيد الذي تعرفه `SalesService`
عن ZATCA هو استدعاء واحد بعد إنشاء الفاتورة)، وجدول امتثال منفصل
(`invoice_compliance`، RLS كاملة). **غير المُنفَّذ، وBlocked صراحة**: أي
شيء يحتاج اعتمادات/عقد ZATCA حقيقيَين — XML/UBL، Hashing وسلسلة Previous
Invoice Hash، التوقيع الرقمي، CSID، أو أي اتصال شبكي فعلي بواجهات
Clearance/Reporting. لم يُخترَع أي عقد API أو بيانات اعتماد وهمية لإنجاح
الاختبارات.

## ما تم إنجازه

- [x] **Architecture Review حقيقي قبل أي تعديل**: قراءة فعلية لـ
      `schema.prisma`، `sales.service.ts`، `invoices.service.ts`،
      `integrations` (ports/registry/webhooks)، و`docs/ZATCA.md` —
      تأكيد أنه **لا يوجد أي كود ZATCA سابق على الإطلاق** (لا QR، لا
      XML، لا Hash، لا CSID، لا اتصال خارجي) قبل البدء.
- [x] **توليد رمز QR (Phase 1)**: `TlvQrService`
      (`backend/src/modules/einvoice/tlv-qr.service.ts`) — ترميز TLV
      بايت-بايت (Tag 1 بايت + Length 1 بايت بطول UTF-8 الحقيقي + Value)
      للحقول الخمسة المنشورة (اسم البائع، الرقم الضريبي، الطابع الزمني
      ISO 8601، إجمالي الفاتورة، إجمالي الضريبة)، Base64 للناتج الكامل.
      **مُتحقَّق منه بفك ترميز فعلي واسترجاع القيم بالضبط** (اختبارات
      Unit + e2e)، وليس افتراضًا. تحقق من المواصفة عبر مصادر تقنية ثانوية
      متعددة مستقلة (الوصول المباشر لملف zatca.gov.sa الرسمي كان محظورًا
      في بيئة التطوير) — موثَّق بصراحة في `docs/ZATCA.md`.
- [x] **تصنيف الفاتورة**: كل فاتورة في هذا النظام "مبسّطة" (B2C) لأنها
      تُصدَر حصرًا من POS — قرار مبني على واقع نطاق المنتج (بقالة/سوبرماركت)،
      موثَّق كسبب لعدم وجود عمود `invoiceType`، وليس تبسيطًا اعتباطيًا.
- [x] **`invoice_compliance` (جدول جديد منفصل)**: 1:1 مع `Invoice`، RLS
      كاملة (`FORCE ROW LEVEL SECURITY` + `tenant_isolation`)، بدون أي
      عمود hash/CSID/signing وهمي — تُرِكت هذه الأعمدة كاملةً بدل تخمين
      أسماء/بنية ستبقى فارغة لأجل غير مسمى.
      `EInvoiceStatus.not_submitted` هي القيمة الوحيدة المُستخدَمة فعليًا؛
      باقي القيم (`pending`/`reported`/`cleared`/`rejected`) محجوزة
      لـPhase 2 فقط، موثَّق صراحة أنها غير مُستخدَمة اليوم.
- [x] **عزل معماري حقيقي**: `SalesService.createSale` تستدعي
      `EInvoiceService.generateForInvoice(...)` **مرة واحدة فقط** بعد
      `tx.invoice.create(...)` — لا تغيير آخر على منطق البيع/المخزون/
      المحاسبة. مُتحقَّق منه: **134 اختبارًا سابقًا لا تزال 134/134
      ناجحة بعد هذا الربط**، صفر تراجع.
- [x] **`ZatcaProvider` (port لـPhase 2)**: واجهة معرَّفة بوضوح
      (`checkCompliance`/`clearInvoice`/`reportInvoice`) — **غير مُنفَّذة
      وغير مسجَّلة في أي مكان**، بنفس مبدأ `IntegrationRegistry` قبل وجود
      أي Payment adapter فعلي. أسماء الدوال تصميم هذا المشروع، وليست نسخة
      عن عقد ZATCA فعلي (لم يُراجَع).
- [x] **Audit**: كل توليد سجل امتثال يُسجَّل عبر `AuditService` الموجود
      أصلًا (`einvoice.compliance.generate`) — لا Audit system جديد.
- [x] **واجهة أمامية حقيقية**: زر "عرض QR" في صفحة المبيعات/الفواتير
      يظهر **فقط** للفواتير التي تملك رمزًا فعليًا (لا حالة وهمية)، يفتح
      نافذة تعرض صورة QR حقيقية (مكتبة `qrcode`) مع تنويه صريح "مُولَّد
      محليًا، لم يُرسَل بعد لأي واجهة برمجية خارجية" — لا ادّعاء امتثال.
      حقل "الرقم الضريبي (اختياري)" أُضيف لنموذج التسجيل تحديدًا لأن
      الميزة كانت ستبقى غير قابلة للوصول من أي مستخدم حقيقي بدونه رغم
      اكتمالها في الخادم (لا شاشة إعدادات منشأة كاملة أُنشئت — حقل واحد
      فقط في نموذج موجود أصلًا).
- [x] **اختبارات شاملة، لا Fake Compliance**: 5 اختبارات e2e جديدة
      (`einvoice.e2e-spec.ts`) + 4 اختبارات Unit جديدة
      (`tlv-qr.service.spec.ts`، أول ملف Unit test في الـBackend) + 2
      اختبار Vitest + 1 مجموعة Playwright جديدة (تسجيل حقيقي برقم ضريبي
      → بيع → رمز QR حقيقي `data:image/png;base64,...` على الشاشة). لا
      اختبار واحد يفترض `status === 'CLEARED'` أو أي حالة إرسال لم تحدث
      فعليًا.

## Not Implemented (بوضوح، وليس نسيانًا)

- توليد XML/UBL.
- Hashing (SHA-256) وسلسلة Previous Invoice Hash.
- التوقيع الرقمي (Cryptographic Stamp).
- تسجيل/Onboarding لدى ZATCA للحصول على CSID.
- أي اتصال شبكي فعلي بواجهات Clearance/Reporting/Compliance.
- `CertificateProvider`/`SecretProvider` (لا حاجة فعلية لهما بدون شيء
  حقيقي ليُخزَّن بعد).

## Blocked (يحتاج قرارًا/اعتمادات منك)

- **الموجة (Wave) والحد المالي**: هل يحتاج هذا التاجر تحديدًا Phase 1
  فقط أم Phase 1+2 مباشرة؟ قرار تجاري/قانوني لا يُستنتَج من الكود.
- **نطاق سلسلة Previous Invoice Hash**: لكل جهاز POS أم لكل فرع أم عام
  للمنشأة؟ موثَّق كسؤال مفتوح في `docs/ZATCA.md` منذ ما قبل هذا
  الـMilestone، لا يزال غير محسوم.
- **عقد ZATCA API الفعلي**: Endpoints، صيغ الطلب/الاستجابة — لم يُراجَع.
- **CSID + شهادة + مفتاح خاص**: يحتاج عملية Onboarding فعلية لدى ZATCA
  لهذا التاجر تحديدًا.

## Tests

**139/139** خلفية e2e (134 سابقة + 5 جديدة، صفر تراجع) + **4/4** Unit
جديدة (أول ملف Unit في الـBackend) + **11/11** Vitest (9 + 2 جديدة) +
Playwright **4/4** (3 سابقة + 1 جديدة) — كلها مُتحقَّقة فعليًا بالتشغيل.

## Push
NOT PUSHED

---

## سجل تحديثات هذا الملف

- 2026-08-15: إنشاء الملف عند بدء المرحلة 1.
- 2026-08-15: المرحلة 1 مكتملة ومُختبرة (10/10 اختبارات e2e ناجحة، build/lint نظيفان).
- 2026-08-15: إعادة هيكلة Auth/IAM لنموذج User/Tenant/Membership مكتملة
  ومُختبرة (16/16، build/lint نظيفان) — بانتظار موافقة صريحة لبدء المرحلة 2.
- 2026-08-15: المرحلة 2 (Products/Inventory/Customers/Suppliers + Frontend)
  مكتملة ومُختبرة (33/33، build/lint/typecheck نظيفة) — بانتظار موافقة صريحة
  لبدء المرحلة 3.
- 2026-08-15: المرحلة 2.1 (Branch/Warehouse Authorization Hardening) مكتملة
  ومُختبرة (38/38، build/lint/typecheck نظيفة) — بانتظار موافقة صريحة لبدء
  المرحلة 3.
- 2026-08-15: المرحلة 3 (POS/Sales/Payments/Invoices + أساس التكامل) مكتملة
  ومُختبرة (63/63، build/lint/typecheck نظيفة في backend وfrontend، Playwright
  ناجح) — بانتظار موافقة صريحة لبدء المرحلة 4.
- 2026-08-15: المرحلة 4 (Purchases/Expenses/Accounting Foundation) مكتملة
  ومُختبرة (91/91، build/lint/typecheck نظيفة في backend وfrontend، Playwright
  يدوي ناجح) — بانتظار موافقة صريحة لبدء المرحلة القادمة.
- 2026-08-15: Milestone 1 (Accounting Completion — تقارير مالية/ذمم/أرصدة
  افتتاحية/فترات محاسبية) مكتمل ومُختبر (112/112، Playwright يدوي ناجح مع
  إصلاح عِلّة تنسيق أرقام حقيقية) — بانتظار موافقة صريحة لبدء المرحلة
  القادمة.
- 2026-08-15: Milestone 2 (Production Hardening + Demo/Staging Readiness —
  CORS/Health/Logging + إصلاحات أداء + Docker/CI (تهيئة، غير مُختبَرة فعليًا)
  + بذر بيانات تجريبية (نُفِّذ فعليًا ونجح) + إصلاحات RBAC/استجابة/اختبارات
  آلية في الواجهة الأمامية) مكتمل ومُختبر (112/112 خلفية بلا تراجع + 7/7
  Vitest جديدة + Playwright 2/2 مُلتزَمة، بلا أي تغيير على المخطط) —
  بانتظار موافقة صريحة لبدء المرحلة القادمة.
- 2026-08-16: Milestone 3 (Excel Import — File Storage abstraction محلية
  (S3-compatible مصمَّم، غير مُنفَّذ) + Import Wizard كامل لـ7 أنواع بيانات
  فوق الخدمات الموجودة أصلًا، بلا منطق موازٍ) مكتمل ومُختبر (134/134 خلفية
  بلا تراجع + 9/9 Vitest + Playwright 3/3 مُلتزَمة، جدول جديد واحد فقط
  `import_jobs` بـRLS كامل) — بانتظار موافقة صريحة لبدء المرحلة القادمة.
- 2026-08-16: Milestone 4 (ZATCA E-Invoicing Readiness — توليد رمز QR
  محلي Phase 1 فقط، معزول تمامًا عن SalesService/InvoicesService عبر
  `EInvoiceService`، جدول جديد واحد فقط `invoice_compliance` بـRLS
  كامل؛ Phase 2 بالكامل — XML/Hashing/التوقيع/CSID/الإرسال الفعلي —
  Blocked صراحة بانتظار عقد ZATCA واعتمادات حقيقية) مكتمل ومُختبر ضمن
  نطاقه (139/139 خلفية بلا تراجع + 4/4 Unit جديدة + 11/11 Vitest +
  Playwright 4/4) — بانتظار موافقة صريحة لبدء المرحلة القادمة.
