# حالة المشروع (Project Status)

**آخر تحديث**: 2026-08-15
**المرحلة الحالية**: Phase 4 — Purchases + Expenses + Accounting Foundation
— **مكتملة ومُختبرة**، بانتظار موافقتك الصريحة لبدء المرحلة القادمة

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
prisma:seed && npm run start:dev`، ثم `npm run test:e2e` (91/91 حاليًا).
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
- 2026-08-15: المرحلة 2.1 (Branch/Warehouse Authorization Hardening) مكتملة
  ومُختبرة (38/38، build/lint/typecheck نظيفة) — بانتظار موافقة صريحة لبدء
  المرحلة 3.
- 2026-08-15: المرحلة 3 (POS/Sales/Payments/Invoices + أساس التكامل) مكتملة
  ومُختبرة (63/63، build/lint/typecheck نظيفة في backend وfrontend، Playwright
  ناجح) — بانتظار موافقة صريحة لبدء المرحلة 4.
- 2026-08-15: المرحلة 4 (Purchases/Expenses/Accounting Foundation) مكتملة
  ومُختبرة (91/91، build/lint/typecheck نظيفة في backend وfrontend، Playwright
  يدوي ناجح) — بانتظار موافقة صريحة لبدء المرحلة القادمة.
