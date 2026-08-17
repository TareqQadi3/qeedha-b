# حالة المشروع (Project Status)

**آخر تحديث**: 2026-08-17
**الحالة**: **Milestone 8 — SaaS / Subscription & Billing — منفَّذ
بالكامل** (راجع قسم "Milestone 8" في أسفل هذا الملف للتقرير النهائي
الكامل). يحوّل هذا الـMilestone Qeedha B إلى منتج SaaS حقيقي: خطط
(`Plan`)، اشتراك لكل منشأة (`Subscription`)، فترة تجريبية 14 يومًا
بعواقب فعلية عند الانتهاء، صلاحيات ميزات (Feature Entitlements) كطبقة
إضافية فوق RBAC الموجود (وليست بديلة عنه)، حدود استخدام آمنة للتزامن،
ودمج مع `CompanyStatus` الموجود سلفًا. لا تكامل دفع خارجي حقيقي، لا
Control Center، لا Website — راجع قسم "Milestone 8" أدناه للتفصيل
الكامل. **الخطة المتبقية محدودة صراحة بمرحلتين فقط: 9 — Qeedha
Integration، 10 — الإصدار الإنتاجي النهائي؛ لا مراحل إضافية.**

## الحالة الإجمالية: 🟢 Milestone 8 مكتمل — جاهز للانتقال إلى Milestone 9

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

# Milestone 5 — Accounting Completion Verification

**Status**: Completed (لا فجوات تنفيذية جديدة — تحقق + إغلاق فجوات اختبار فقط)

## ملخص: ما هذا الـMilestone وما ليس

طلب هذا الـMilestone وصف Trial Balance/General Ledger/Profit & Loss/
Balance Sheet/AR/AP Subledger/Fiscal Periods/Accounting Opening Balances
كفجوات محاسبية ناقصة يجب بناؤها، مع تعليمة صريحة بمراجعة الكود الفعلي أولًا
قبل أي تنفيذ ("لا تعيد بناء شيء يعمل"). **المراجعة المعمارية الفعلية لكل
ملف في `backend/src/modules/accounting/` (`journal.service.ts`،
`accounting.service.ts`، `accounting-reports.service.ts`،
`subledger.service.ts`، `fiscal-periods.service.ts`،
`opening-balance.service.ts`، الستة Controllers، `schema.prisma`،
`docs/ACCOUNTING.md`، `test/milestone1.e2e-spec.ts`، وصفحات الواجهة
الأمامية الثلاث `ReportsPage.tsx`/`ReceivablesPayablesPage.tsx`/
`AccountingPage.tsx`) أثبتت أن هذا النطاق بالكامل — الأربعة تقارير حية
مبنية على `groupBy`/`aggregate` مباشرة على `JournalLine`، AR/AP Subledger
حقيقي، فترات مالية بحارس `assertTodayNotLocked` فعلي داخل
`JournalService.postJournalEntry`/`reverseJournalEntry`، وأرصدة افتتاحية
محاسبية عبر نفس نقطة الترحيل الوحيدة بحارس تزامن `P2002` حقيقي — **كان
مُنفَّذًا فعليًا ومُختبَرًا مسبقًا** ضمن "Milestone 1: Accounting Completion"
(نفس هذه الجلسة، تسمية مختلفة). راجع commit `2871835` وقسم "Milestone 1"
أعلاه لتفاصيل ذلك التنفيذ الأصلي — لم يُعَد بناؤه هنا، ولا داعي له.

**العمل الفعلي المُنفَّذ في هذه الدورة** هو إغلاق فجوات **اختبار** حقيقية
تركها Milestone 1، عثر عليها الاستعراض المعماري لا أكثر ولا أقل — بدون أي
تغيير على `schema.prisma`، منطق الخدمات، الـControllers، أو أي صفحة واجهة
أمامية:

1. لا يوجد أي ملف Vitest للصفحات الثلاث `ReportsPage.tsx` /
   `ReceivablesPayablesPage.tsx` / `AccountingPage.tsx` (تبويبَي الأرصدة
   الافتتاحية والفترات) — أُضيفت.
2. `frontend/e2e/golden-path.spec.ts` كان يزور فقط تبويب ميزان المراجعة
   وAP من كل السطح المحاسبي — مُدَّد ليمر فعليًا عبر دفتر الأستاذ/الأرباح
   والخسائر/الميزانية العمومية/AR (يتحقق من نص الفجوة الهيكلية الموثَّقة)
   وإنشاء فترة محاسبية فعلية.
3. `test/milestone1.e2e-spec.ts` كان يختبر نجاح إقفال الفترة/تسجيل الرصيد
   الافتتاحي دون التحقق المباشر من دخول سجل فعلي في `AuditLog` (خلافًا
   لنمط `phase4.e2e-spec.ts` المُستخدَم لعمليات حساسة أخرى) — أُضيف تحقق
   مباشر (`tx.auditLog.findFirst`) لـ`accounting.period.close` و
   `accounting.opening_balance.create`.

لا Model جديد، لا Migration جديدة، لا Endpoint جديد، لا صفحة واجهة أمامية
جديدة، لا صلاحية RBAC جديدة — كل ذلك كان موجودًا وكاملًا مسبقًا.

## COGS / تقييم المخزون — لا يزال DECISION REQUIRED

لم يُمَس هذا القرار إطلاقًا في هذه الدورة، تمامًا كما لم يُمَس في
Milestone 1. راجع القسم المخصَّص في التقرير النهائي أدناه (ونفس التفصيل في
`docs/ACCOUNTING.md` "مؤجَّل") — لا يزال بلا طريقة تقييم مُختارة
(FIFO/متوسط مرجّح)، وقيد البيع لا يزال بلا سطر مخزون/COGS.

## Known Limitations (كما كانت في Milestone 1، لم تتغيّر)

- AR فارغ هيكليًا دائمًا اليوم (لا بيع آجل في النظام) — موثَّق، ومُختبَر
  الآن أيضًا عبر Playwright صراحة (نص الفجوة يظهر في الواجهة).
- AP لا يتناقص أبدًا (لا خطوة "دفع لمورد" بعد).
- لا قيد إقفال فترة فعلي يكنس صافي الدخل إلى Equity — الميزانية العمومية
  تعرض بندًا محسوبًا (`computed: true`) بدلًا من ذلك، كما في Milestone 1.
- COGS/تقييم المخزون: DECISION REQUIRED (أعلاه).
- لا مرتجعات مشتريات، لا تسوية بنكية — خارج نطاق كل مرحلة حتى الآن.

## Tests

**139/139** خلفية e2e (نفس عدد Milestone 4 — الإضافتان الجديدتان تحققان
إضافيان داخل اختبارَين موجودَين، وليسا حالتَي اختبار جديدتَين) + **30/30**
Vitest (11 سابقة + 19 جديدة عبر 3 ملفات جديدة) + Playwright **4/4** (نفس
العدد، `golden-path.spec.ts` مُمدَّد لا ملف جديد) — كلها مُتحقَّقة فعليًا
بالتشغيل ضد Postgres حقيقي مُهاجَر ومزروع وBackend حقيقي يعمل.

## Build / Lint / Typecheck
Backend: build ✅ / lint ✅ / `tsc --noEmit` ✅ / `prisma migrate status`:
up to date، لا drift (لا Migration جديدة). Frontend: build ✅ / lint ✅ /
`tsc --noEmit` ✅.

## Push
NOT PUSHED

---

# Milestone 6 — Weighted-Average Inventory Valuation & COGS

**Status**: Completed

## ملخص: ما هذا الـMilestone وما ليس

حسم القرار الذي بقي معلَّقًا صراحة منذ نهاية Milestone 1/5 —
**COGS / تقييم المخزون**. القرار المُتَّخَذ بعد مراجعة معمارية فعلية (لا
افتراض مسبق): **Weighted Average (متوسط مرجّح متحرك)**، وليس FIFO —
`StockLevel` كان أصلًا صفًا واحدًا لكل (Product, Warehouse) بلا أي مفهوم
Lot/Batch في المخطط بأكمله، فبناء FIFO كان سيتطلب طبقة Cost Lot/Layer
جديدة كاملة عبر Purchases/Sales/Adjustments/Counts/Transfers معًا؛
Weighted Average يناسب الشكل الحالي بعمود واحد جديد فقط. راجع
`docs/ACCOUNTING.md` "COGS / تقييم المخزون (Milestone 6)" للتفصيل
الكامل: الصيغة، مصادر التكلفة لكل نوع حركة، التكامل المحاسبي، المرتجعات،
البيانات القديمة، والقيود المعروفة.

## ما تم إنجازه

- [x] **Schema**: عمودان جديدان فقط — `stock_levels.average_cost`
      (Decimal(14,4)، افتراضي 0) و`sale_items.unit_cost` (Decimal(14,4)?،
      قابل لـNULL للبيانات القديمة). Migration واحدة نظيفة
      (`20260816150000_milestone6_weighted_average_cogs`)، لا Migration
      قديمة عُدِّلت، لا drift على dev أو test.
- [x] **`InventoryService.recordMovement` مُمدَّدة، لا مسار كتابة موازٍ**:
      نفس UPDATE الذرّي المحروس الذي يكتب `quantity_on_hand` منذ Phase 2
      يكتب الآن `average_cost` أيضًا في نفس الجملة (صيغة `CASE`/
      `COALESCE` كاملة داخل SQL)، بلا أي قراءة-ثم-كتابة غير محمية.
- [x] **`InventoryValuationService` (جديد)**: طبقة رقيقة —
      `recordReceipt`/`recordIssue` — هي المصدر الوحيد لحساب مبلغ COGS
      (`round2` الموجودة أصلًا)، تُستخدَم من Sales/Purchases/Inventory/
      StockCount بدل تكرار الصيغة في كل مكان.
- [x] **مصادر التكلفة مُحدَّدة صراحة لكل نوع حركة**: شراء (`PurchaseItem
      .unitCost` الموجود أصلًا)، رصيد افتتاحي (حقل `unitCost` اختياري
      جديد، fallback إلى `Product.costPrice`)، تسوية زيادة (حقل
      `unitCost` اختياري جديد، fallback للمتوسط الحالي)، تسوية نقصان/جرد
      سالب (التكلفة الحالية دائمًا)، تحويل (تكلفة المستودع المصدر
      الفعلية، لا اختراع ولا فقدان).
- [x] **`Dr COGS (5010) / Cr Inventory (1200)` على كل بيع**: الحساب `5010`
      كان مزروعًا منذ المرحلة 4 ومعلَّقًا "Reserved, unused" — أصبح
      مُستخدَمًا فعليًا الآن، بلا حساب جديد. القيمة مُشتقّة حصرًا من
      محرّك التقييم، **لا مسار فيه يقبل قيمة من العميل**
      (`CreateSaleDto`/`SaleItemInputDto` لا يحملان أي حقل تكلفة أصلًا،
      و`forbidNonWhitelisted` يرفض أي محاولة بـ400 — مُختبَر صراحة).
- [x] **المرتجعات (`cancelSale`)**: تُعيد المخزون بنفس تكلفة البيع
      الأصلية (`SaleItem.unitCost` المُخزَّن وقت البيع)، لا بالمتوسط
      الحالي الذي قد يكون تغيّر بعد شراء جديد بين البيع والإلغاء — عكس
      قيد COGS/Inventory يحدث تلقائيًا عبر `reverseJournalEntry` الموجود
      أصلًا، بلا أي كود جديد لذلك تحديدًا. مُختبَر بسيناريو انحراف تكلفة
      حقيقي.
- [x] **البيانات القديمة**: لا تخمين لأي تكلفة تاريخية — `SaleItem
      .unitCost` يبقى `NULL` لأي سطر بيع سابق لهذه المرحلة، وإلغاؤه
      يستخدم fallback محايد (المتوسط الحالي). موثَّق صراحة، لا Migration
      بيانات اختراعية.
- [x] **`AccountingReportsService.getProfitAndLoss`**: حقلان جديدان
      متوافقان خلفيًا — `costOfGoodsSold` و`grossProfit`، بلا استعلام
      إضافي (يُستخرَجان من `expenses[]` المحسوبة أصلًا).
      `getBalanceSheet` **لم يتغيّر إطلاقًا** — قيمة `1200` تبقى متسقة
      تلقائيًا مع الشراء/البيع.
- [x] **Concurrency حقيقي مُختبَر**: عمليتا شراء متزامنتان حقيقيتان
      (لا نظري) تُنتجان متوسط تكلفة صحيحًا بغضّ النظر عن ترتيب التنفيذ،
      و10 عمليات بيع متزامنة على رصيد 5 وحدات فقط تُنتج 5 نجاح/5 رفض
      (409) بلا رصيد سالب ولا COGS خاطئ.
- [x] **واجهة أمامية**: `InventoryPage.tsx` تعرض عمودَي متوسط
      التكلفة/قيمة المخزون + حقل تكلفة اختياري في نموذجَي الرصيد
      الافتتاحي/التسوية (يظهر فقط عند زيادة). `ReportsPage.tsx` تبويب
      P&L يعرض COGS وGross Profit. لا إعادة تصميم.
- [x] **لا ترحيل محاسبي للتسويات/الجرد**: قرار متعمَّد وموثَّق (وليس
      نسيانًا) — راجع "Known Limitations" أدناه وفي `docs/ACCOUNTING.md`.

## القيود المعروفة (Known Limitations)

- **التسويات اليدوية والجرد لا تُرحِّلان قيدًا محاسبيًا** (كما كان الحال
  قبل هذه المرحلة تمامًا) — تُحدِّثان الكمية/المتوسط بشكل صحيح، لكن حساب
  `1200` المحاسبي قد يختلف عن `quantity_on_hand × average_cost` الفعلي
  بعدها حتى يُصحَّح يدويًا. ربطها بالمحاسبة قرار عمل منفصل (أي تصنيف
  محاسبي؟) لم يُطلَب حسمه هنا.
- **رصيد المخزون الافتتاحي لا يُنشئ قيدًا محاسبيًا تلقائيًا** — كما كان،
  منفصل تمامًا عن Accounting Opening Balance (Milestone 1).
- **بيانات `StockLevel` قبل هذه المرحلة تبدأ بـ`average_cost = 0`** حتى
  أول حركة واردة جديدة بعد الترقية.
- لا مرتجعات مبيعات جزئية (لم يتغيّر) — `cancelSale` إلغاء كامل فقط.
- لا FIFO — القرار المُتَّخَذ Weighted Average فقط، موثَّق ومُبرَّر.

## Tests

**161/161** خلفية e2e (139 سابقة + 22 جديدة في `milestone6.e2e-spec.ts`،
صفر تراجع؛ اختباران موجودان في `milestone1`/`phase4` عُدِّلا ليعكسا
سلوك COGS الجديد الصحيح، وليس لإخفاء تراجع) + **34/34** Vitest (30 سابقة
+ 4 جديدة لـ`InventoryPage.test.tsx` + تمديد `ReportsPage.test.tsx`) +
Playwright **4/4** (بدون ملف جديد، `golden-path.spec.ts` مُمدَّد
بتحققات قيمة المخزون/COGS/Gross Profit) — كلها مُتحقَّقة فعليًا بالتشغيل
ضد Postgres حقيقي وBackend حقيقي يعمل.

## Build / Lint / Typecheck / Migration
Backend: build ✅ / lint ✅ / `tsc --noEmit` ✅ / `prisma migrate status`:
up to date على dev وtest، لا drift. Frontend: build ✅ / lint ✅ /
`tsc --noEmit` ✅.

## Docker
**BLOCKED BY ENVIRONMENT** — Docker daemon غير متاح في بيئة التطوير هذه
(`docker ps` يفشل: `dial unix /var/run/docker.sock: connect: no such
file or directory`). لم يُدَّعَ أن Docker build نجح؛ لم يُختبَر إطلاقًا
في هذه الدورة أو أي دورة سابقة (نفس القيد المُسجَّل منذ Milestone 2).

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
- 2026-08-16: Milestone 5 (Accounting Completion Verification — المراجعة
  المعمارية أثبتت أن Trial Balance/GL/P&L/Balance Sheet/AR/AP/Fiscal
  Periods/Opening Balances المطلوبة كانت مُنفَّذة بالفعل ضمن Milestone 1؛
  العمل الفعلي: 3 ملفات Vitest جديدة للصفحات التي لم يكن لها اختبار، تمديد
  Golden Path Playwright ليغطي كل السطح المحاسبي، اختبار Audit Log صريح
  لإقفال الفترة/الرصيد الافتتاحي — بلا أي تغيير على المخطط أو المنطق
  الخلفي. COGS/تقييم المخزون لا يزال DECISION REQUIRED، لم يُمَس) مكتمل
  ومُختبر (139/139 خلفية + 30/30 Vitest + Playwright 4/4) — بانتظار
  موافقة صريحة لبدء المرحلة القادمة.
- 2026-08-16: Milestone 6 (Weighted-Average Inventory Valuation & COGS —
  حسم قرار COGS/تقييم المخزون المؤجَّل منذ Milestone 1: Weighted Average،
  عمودان جديدان فقط (`stock_levels.average_cost`،
  `sale_items.unit_cost`)، تحديث ذرّي لمتوسط التكلفة ضمن نفس UPDATE
  المحروس الموجود أصلًا لـ`quantity_on_hand`، `Dr COGS(5010)/Cr
  Inventory(1200)` على كل بيع بقيمة مُشتقّة خادميًا بالكامل، مرتجعات
  تُعيد المخزون بتكلفة البيع الأصلية لا المتوسط الحالي، لا ترحيل محاسبي
  للتسويات/الجرد (قرار موثَّق)) مكتمل ومُختبر (161/161 خلفية + 34/34
  Vitest + Playwright 4/4، بما فيها اختبارا تزامن حقيقيَّين) — بانتظار
  موافقة صريحة لبدء المرحلة القادمة.
- 2026-08-17: **Final Completion & Release Candidate** — تدقيق نهائي
  شامل للمنتج بأكمله (لا كود جديد، قراءة فقط ثم إعادة تشغيل كامل
  مجموعة التحقق): git status/log، بنية backend/frontend، env validation،
  CORS، Rate Limiting، Health، RLS، RBAC، الاستيراد من Excel (حماية
  CSV/formula injection)، ZATCA Phase 1، refresh token rotation/reuse
  detection، فحص أسرار على كامل المستودع (لا تسريب). تشغيل فعلي حقيقي
  لكل الأسرة الذهبية (Registration → ... → COGS) عبر Playwright ضد
  backend حقيقي، وليس قراءة كود فقط. لم يُوجَد أي عائق حقيقي (Real
  Blocker) يمنع إصدار نسخة تجريبية/Staging مضبوطة. **Qeedha B مُصنَّف
  RELEASE CANDIDATE — READY.** راجع قسم "Final Release Candidate" أدناه
  للتقرير الكامل.

---

# Final Release Candidate — 2026-08-17

**Status: RELEASE CANDIDATE — READY**

مراجعة نهائية للمنتج بأكمله كما هو اليوم (لا مرحلة جديدة، لا ميزة
مُخترَعة) — تحقّق فقط أن كل ما بُني عبر Phase 1 حتى Milestone 6 يعمل
معًا بشكل صحيح ومتّسق، وأنه لا يوجد عائق حقيقي (أمني، محاسبي، أو
وظيفي) يمنع طرحه كنسخة تجريبية/Staging مضبوطة. **لم يُعدَّل أي كود في
هذه الدورة** — التغيير الوحيد هو هذا التصنيف الرسمي في التوثيق.

## النطاق المُتحقَّق (Verified Core)
Auth (JWT + دوران/كشف إعادة استخدام Refresh Token) · Multi-tenancy ·
RBAC · RLS · Branch/Warehouse Scope · Audit · Catalog · Inventory · POS ·
Sales · Payments · Invoices · Purchases · Expenses · Double-Entry
Accounting · Chart of Accounts · Journal Entries · Trial Balance ·
General Ledger · P&L · Balance Sheet · AR/AP · Fiscal Periods · Accounting
Opening Balances · Weighted Average Inventory Valuation · COGS · Excel
Import · ZATCA Phase 1 QR.

## الأسرة الذهبية (Golden Path) — PASS
`frontend/e2e/golden-path.spec.ts` نُفِّذ فعليًا (لا قراءة كود فقط) ضد
Backend حقيقي: تسجيل → منتج → مخزون (رصيد افتتاحي + متوسط تكلفة/قيمة
مخزون) → عميل → مورد → شراء → استلام → بيع POS → دفعة → فاتورة → مصروف
→ محاسبة (قيود Sale/Purchase/Expense) → ميزان مراجعة (متوازن) → دفتر
أستاذ → أرباح وخسائر (COGS + Gross Profit) → ميزانية عمومية (متوازنة) →
ذمم (AR فارغ هيكليًا موثَّق / AP يُظهر المورد) → فترة محاسبية → تسجيل
خروج/دخول. بالإضافة: `einvoice-qr.spec.ts` (ZATCA Phase 1 QR حقيقي)،
`excel-import.spec.ts` (المعالج الكامل)، `tenant-isolation.spec.ts`
(عزل حقيقي عبر المتصفح). **4/4 نجحت فعليًا.**

## السلامة المالية (Financial Integrity) — PASS
مُتحقَّق عبر `test/milestone6.e2e-spec.ts` و`test/milestone1.e2e-spec.ts`
وتشغيل فعلي: مدين = دائن على كل قيد، قيمة المخزون = الكمية × متوسط
التكلفة، COGS مُشتقّة خادميًا بالكامل (لا مسار للعميل ليحدِّد تكلفة أو
COGS — `SaleItemInputDto` لا يحمل حقل تكلفة أصلًا، `forbidNonWhitelisted`
يرفض أي محاولة بـ400)، إلغاء بيع يُعيد المخزون بالتكلفة الأصلية ويعكس
قيد COGS/Inventory تلقائيًا، Idempotency عبر `clientReferenceId`.

## عزل المستأجرين (Tenant Isolation) — PASS
RLS + RBAC + IDOR + نطاق الفروع/المستودعات مُتحقَّقة عبر عشرات
الاختبارات عبر كل ملفات `test/*.e2e-spec.ts` بالإضافة لاختبار Playwright
حقيقي عبر المتصفح (`tenant-isolation.spec.ts`).

## الأمان (Security) — PASS
CORS مبني على allowlist صريح (رفض بدء حقيقي في الإنتاج بلا origins)،
`ThrottlerModule` مُفعَّل عالميًا (`APP_GUARD`)، Env Validation فعلي
(`class-validator`) يمنع بدء التطبيق بمتغيرات ناقصة، حماية
CSV/Formula Injection في الاستيراد (`imports/sanitize.ts`)، دوران/كشف
إعادة استخدام Refresh Token (`auth.service.ts`)، Health endpoint حقيقي
(503 عند فشل قاعدة البيانات)، فحص أسرار على كامل المستودع (لا مطابقات
حقيقية — كل ما ظهر كلمات مرور اختبار واضحة الغرض أو placeholders
موسومة "please-change").

## Tests
Backend: **161/161** e2e. Frontend: **34/34** Vitest. Playwright:
**4/4**. كلها أُعيد تشغيلها فعليًا في هذه الدورة، وليس نقلًا عن تقرير
سابق.

## Build / Lint / Typecheck / Database
Backend build/lint/`tsc --noEmit`: PASS. Frontend build/lint/`tsc
--noEmit`: PASS. `prisma migrate status` على dev وtest: up to date، لا
drift.

## Docker
**BLOCKED BY ENVIRONMENT** — `docker ps` يفشل (`dial unix
/var/run/docker.sock`) — لا daemon متاح في بيئة التطوير هذه. لم يُدَّعَ
تشغيله؛ Dockerfiles وdocker-compose.yml مكتوبة وموجودة (منذ Milestone 2)
لكن غير مُختبَرة فعليًا هنا أو في أي دورة سابقة — نفس القيد الموثَّق
باستمرار منذ Milestone 2.

## CI
PARTIAL — `.github/workflows/ci.yml` صحيح نحويًا (`yaml.safe_load`
نجح) لكن لم يُشغَّل فعليًا على أي GitHub Actions runner حقيقي (بيئة
التطوير هذه لا تملك وصولًا لذلك) — موثَّق منذ Milestone 2،
`docs/DEPLOYMENT.md` "القيود المعروفة".

## Secret Scan
PASS — بحث شامل على كامل المستودع (أنماط مفاتيح AWS/GitHub/Slack/Private
Key + أنماط `password=`/`secret=`/`token=` بقيم حرفية) — لا تسريب حقيقي.

## التغييرات المُنفَّذة في هذه الدورة
**لا تغيير كود** — تدقيق نهائي فقط. التغيير الوحيد: هذا القسم في
`docs/PROJECT_STATUS.md` (بالإضافة لبنود مماثلة صغيرة في
`docs/CHANGELOG.md`) يُسجِّل التصنيف الرسمي RELEASE CANDIDATE — READY.

## القيود المعروفة (حقيقية، غير حاجبة للإصدار)
- لا ترحيل محاسبي تلقائي للتسويات اليدوية/فروقات الجرد (موثَّق منذ
  Milestone 6).
- لا بيع آجل (Credit Sale) — AR فارغ هيكليًا نتيجة لذلك، موثَّق منذ
  Milestone 1.
- AP لا يتناقص (لا خطوة "دفع لمورد" بعد).
- لا إجراء إقفال فترة محاسبي فعلي يكنس صافي الدخل لحساب Equity حقيقي.
- لا مرتجعات مبيعات/مشتريات جزئية.
- Docker/CI غير مُختبَرين فعليًا في أي بيئة تطوير توفّرت حتى الآن
  (القيد نفسه منذ Milestone 2، وليس شيئًا جديدًا).

## نطاق مستقبلي/خارجي (لم يُلمَس، ولن يُلمَس في هذه الدورة)
Qeedha Integration · Control Center · Website · Affiliate ·
Subscription/Billing · ZATCA Phase 2 (XML/UBL/التوقيع الرقمي/CSID/
الإرسال الفعلي) · Bank Reconciliation · Purchase Returns · Partial
Sales Returns · Multi-currency · تكلفة مخزون متقدمة (FIFO/Lots) ·
Background Queues · Advanced Analytics · تطبيق موبايل أصلي · مزوّدو
تمويل خارجيون.

## Commit
NONE — لم يلزم أي تغيير كود.

## Push
NOT PUSHED

## Git Status
CLEAN

---

# Milestone 7 — Merchant Operations & Business Completion

**تاريخ**: 2026-08-17

## ملخص: ما هذا الـMilestone وما ليس

يُغلق فجوات مُوثَّقة صراحة منذ Milestone 1/5/6 تحت "مؤجَّل" —
`docs/ACCOUNTING.md` القسم "مؤجَّل" كان يسرد بالضبط: بيع آجل، دفعة
لمورد، مرتجعات مبيعات/مشتريات، ترحيل محاسبي للتسويات/الجرد، وتسوية
بنكية. هذا الـMilestone يبني هذه البنود الخمسة بالضبط، ولا شيء غيرها —
لا SaaS/اشتراكات، لا Qeedha Integration، لا Control Center/Website/
Affiliate، لا ZATCA Phase 2، لا عملات متعددة، لا FIFO/Lot متقدم، لا
تطبيقات جوال، لا تحليلات متقدمة، لا بنية Background Jobs — كلها خارج
النطاق صراحة (Milestone 8/9/10 أو خارج الخطة بالكامل).

كل ميزة جديدة عبر نفس نقطة العبور الوحيدة
`JournalService.postJournalEntry` (لا مسار ترحيل مُوازٍ جديد)، بنفس نمط
التزامن (`SELECT ... FOR UPDATE`) وIdempotency (`clientReferenceId`)
المُستخدَمين في كل مرحلة سابقة. **لا إعادة بناء لأي بنية تحتية موجودة**
— تحديدًا، اكتُشف أن `SubledgerService` (AR/AP) لا يحتاج أي تعديل كود
على الإطلاق: يُصفّي بالفعل على `(referenceType, referenceId)` بلا قيد
على أي إجراء أنشأ السطر، فأي قيد جديد بنفس `referenceType:'Sale'`/
`'Purchase'` + `referenceId: <معرّف البيع/الشراء الأصلي>` يظهر تلقائيًا.

## ما تم إنجازه

- **البيع الآجل والذمم المدينة**: `CreateSaleDto.payments` يقبل الآن
  مجموعًا أقل من الإجمالي (بيع جزئي) أو فارغًا (بيع آجل بالكامل، يتطلب
  `customerId`) — الفرق يُرحَّل `Dr` على `1100` ضمن نفس قيد البيع.
  `SalesService.recordPayment` (`POST /sales/:id/payments`) يُسوّي
  الرصيد لاحقًا (`Dr Cash/Bank / Cr AR`)، مع قفل صف حقيقي يمنع الدفع
  الزائد تحت تزامن حقيقي، وIdempotency عبر عمود جديد
  `Payment.clientReferenceId`.
- **دفعات الموردين والذمم الدائنة**: نموذج `SupplierPayment` جديد
  (`purchaseId` إلزامي)، `PurchasesService.recordPayment`
  (`POST /purchases/:id/payments`) — `Dr AP / Cr Cash/Bank`، نفس نمط
  قفل الصف/Idempotency.
- **مرتجعات المبيعات**: `SalesReturnService` جديدة تمامًا (منفصلة عن
  `cancelSale` الذي لم يتغيّر) — نموذجا `SaleReturn`/`SaleReturnItem`،
  مرتجعات جزئية/كلية/متعددة بقفل صف يمنع تجاوز الكمية القابلة للإرجاع،
  عكس المخزون/COGS بالتكلفة التاريخية (`SaleItem.unitCost`)، سياسة
  استرداد موثَّقة ("الذمم أولًا، ثم طريقة أول دفعة").
- **مرتجعات المشتريات**: `PurchaseReturnService` جديدة — نموذجا
  `PurchaseReturn`/`PurchaseReturnItem`، بلا أي تعديل على أمر الشراء
  الأصلي، تخفيض مخزون بحركة صادرة عادية، قيمة القيد بالتكلفة الأصلية
  (`PurchaseItem.unitCost`) لتفادي حساب "فروقات" وسيط.
- **محاسبة تسويات/جرد المخزون**: حسابان جديدان (`4030` أرباح تسوية،
  `5011` مصروف تسوية). آلية جديدة
  `InventoryService.recordMovementWithValueDelta` تأخذ لقطة `FOR UPDATE`
  قبل الكتابة (دون تعديل SQL `recordMovement` المُثبَت) لحساب فرق القيمة
  بدقة رياضية. الجرد يفصل ربحًا/خسارة إجماليَين في قيد واحد بلا تقاصّ
  لتفادي إخفاء عجز خلف ربح أكبر.
- **التسوية البنكية/النقدية**: `BankReconciliationService` جديدة —
  تسجيل أدنى (رصيد دفتري مُشتقّ من `JournalLine` + رصيد كشف حساب يدوي +
  فرق)، بلا مطابقة أسطر فردية وبلا اتصال بأي بنك خارجي — قرار نطاق
  مُتعمَّد وموثَّق.
- **RBAC**: 5 صلاحيات جديدة بتوزيع مبني على فصل المهام (راجع
  `docs/ACCOUNTING.md` "RBAC" للجدول الكامل).
- **قاعدة البيانات**: migration واحدة
  (`20260817000000_milestone7_merchant_operations`) — 6 جداول جديدة (كلها
  RLS FORCE + `tenant_isolation`)، عمود واحد جديد، Backfill idempotent
  لحسابات المنشآت الموجودة. لا حذف بيانات، لا drift.
- **الواجهة الأمامية**: نماذج دفعة/مرتجع حقيقية متصلة ضمن تفاصيل
  الفاتورة (`InvoicesPage.tsx`) وأمر الشراء (`PurchasesPage.tsx`)، تبويب
  "التسوية البنكية/النقدية" جديد في `AccountingPage.tsx`، ودعم بيع آجل/
  جزئي في `PosPage.tsx` (نموذج POS كان يفرض تطابقًا حرفيًا بين الدفعات
  والإجمالي). محاسبة التسويات/الجرد **مرئية تلقائيًا بلا أي كود واجهة
  جديد** عبر تبويب "القيود المحاسبية" الموجود أصلًا (يعرض `referenceType`
  خامًا، فتظهر `StockAdjustment`/`StockCount` بلا أي تعديل).

## الفترات المحاسبية — قرار مُتعمَّد بلا تغيير كود

أُعيد فحص `FiscalPeriodsService`/`JournalService` بالكامل. لا عيب حقيقي
في التصميم الحالي (قفل ترحيل + بند "أرباح غير مقفلة" محسوب في الميزانية)
يستوجب تغييرًا، ولا قرار عمل واضح لبناء "إجراء إقفال محاسبي فعلي" (قيد
يكنس صافي الدخل فعليًا لحساب Equity) بدليل من النموذج الحالي — الهدف
الصحة التشغيلية، لا اكتمال نظري لنظام ERP كامل. راجع
`docs/ACCOUNTING.md` "الفترات المحاسبية — لا تغيير".

## Tests
Backend: **195/195** e2e (161 سابق + 34 جديد في
`test/milestone7.e2e-spec.ts`، منها اختبار تكامل مالي شامل واحد واختبار
RLS مباشر لكل الجداول الستة الجديدة معًا). Frontend: **43/43** Vitest
(34 سابق + 9 جديد عبر 3 ملفات). Playwright: **4/4** (نفس العدد،
`golden-path.spec.ts` مُمدَّد بستة أقسام جديدة، لا ملف جديد). كلها
أُعيد تشغيلها فعليًا في هذه الدورة، وليس نقلًا عن تقرير سابق.

## Build / Lint / Typecheck / Database
Backend build/lint/`tsc --noEmit`: PASS. Frontend build/lint/`tsc
--noEmit`: PASS. `prisma migrate status` على dev وtest: up to date، لا
drift.

## Tenant Isolation / RLS / RBAC / Branch Scope
PASS — RLS مُتحقَّقة مباشرة عبر استعلام SQL خام عابر للمنشآت (بلا فلتر
`companyId` صريح) لكل الجداول الستة الجديدة معًا في اختبار واحد، بالإضافة
لاختبارات IDOR صريحة (دفعة/مرتجع على منشأة أخرى → 404) وRBAC (403 لكل
صلاحية جديدة) لكل مسار جديد. نطاق الفروع مُطبَّق بنفس
`BranchScopeService` الموجود أصلًا على كل Endpoint جديد.

## Accounting Integrity
PASS — مدين=دائن على كل قيد جديد (مُتحقَّق برمجيًا عبر `JournalService`
نفسها، لا قيد جديد يتجاوزها)، سيناريو تكامل مالي شامل واحد (شراء→
استلام→دفعة جزئية لمورد→بيع آجل→دفعتان→مرتجع مبيعات→مرتجع مشتريات→
تسوية مخزون→جرد) يتحقق من توازن ميزان المراجعة بعد **كل** خطوة على
حدة، ثم تطابق الميزانية العمومية/تقييم المخزون النهائي.

## Docker
**BLOCKED BY ENVIRONMENT** — نفس القيد المُسجَّل منذ Milestone 2، لم
يتغيّر.

## CI
PARTIAL — `.github/workflows/ci.yml` لم يتغيّر، لم يُشغَّل فعليًا على
أي GitHub Actions runner حقيقي في هذه البيئة، نفس القيد المُسجَّل منذ
Milestone 2.

## Secret Scan
PASS — بحث شامل على كامل الـdiff والملفات الجديدة (أنماط مفاتيح/أسرار
معروفة) — لا تسريب حقيقي، لا شيء غير `please-change`/بيانات اختبار واضحة
الغرض.

## قيد بيئة حقيقي اكتُشف وأُصلِح (ليس عِلّة في كود Milestone 7)
تسجيل الدخول الأخير في `golden-path.spec.ts` المُمدَّد كشف أن دور
`qeedha_auth_lookup` في قاعدة بيانات هذه الجلسة تحديدًا كان بلا
`GRANT USAGE ON SCHEMA public`/`SELECT` — رغم توثيق هاتين الخطوتين
كسكربتات DBA يدوية إلزامية (`prisma/manual-sql/001_auth_lookup_role.sql`/
`002_auth_lookup_role_update.sql`) منذ نموذج الهوية الأصلي. أُصلِح
بتشغيل السكربتين المُوثَّقين أصلًا (لا تغيير كود، لا تغيير على أي سكربت)
— فجوة تهيئة بيئة هذه الجلسة تحديدًا، وليست عِلّة في التصميم أو الكود.

## القيود المعروفة (حقيقية، غير حاجبة)
- لا إجراء إقفال فترة محاسبي فعلي (قرار مُتعمَّد، راجع أعلاه).
- لا مطابقة أسطر فردية للتسوية البنكية (قرار نطاق مُتعمَّد وموثَّق).
- Docker/CI غير مُختبَرين فعليًا في أي بيئة تطوير توفّرت حتى الآن (نفس
  القيد منذ Milestone 2).

## نطاق مستقبلي/خارجي (لم يُلمَس، ولن يُلمَس في هذا الـMilestone)
SaaS/الاشتراكات والفوترة (Milestone 8) · Qeedha Integration
(Milestone 9) · Control Center · Website · Affiliate · ZATCA Phase 2 ·
عملات متعددة · تكلفة مخزون متقدمة (FIFO/Lots) · تطبيق موبايل أصلي ·
تحليلات متقدمة · Background Queues · مزوّدو تمويل خارجيون.

## Commit
سيُنشأ commit واحد يشمل كل تغييرات هذا الـMilestone (كود + وثائق) فور
اكتمال هذا التقرير.

## Push
NOT PUSHED — ولن يُدفَع في هذه الدورة تحت أي ظرف.

## Git Status
سيكون CLEAN فور إتمام الـcommit الواحد أعلاه.

# Milestone 8 — SaaS / Subscription & Billing

**تاريخ**: 2026-08-17

## ملخص: ما هذا الـMilestone وما ليس

يحوّل Qeedha B إلى منتج SaaS حقيقي: خطط، اشتراك لكل منشأة، فترة تجريبية،
صلاحيات ميزات مبنية على الخطة، حدود استخدام، ودمج مع دورة حياة المنشأة.
**ليس** بناء Control Center الخارجي، **ليس** بناء Website، **ليس**
تكامل تحصيل دفع خارجي حقيقي (Stripe/Moyasar/Tap/HyperPay/بنوك/تمويل
Qeedha) — لا شيء من هذا يخص هذا الـMilestone صراحة (Milestone 9 مخصَّص
لـQeedha Integration). لا إعادة بناء لأي بنية تحتية موجودة — RBAC/RLS/
POS/Inventory/Accounting/AR-AP/Excel Import/ZATCA Phase 1/متوسط
مرجَّح/COGS/عمليات التاجر (Milestone 1-7) لم تُمَس، وإنما دُمج معها طبقة
اشتراك جديدة عند نقاط دخول محدَّدة فقط.

**اكتشاف مهم من مرحلة الفحص الأولي** (القاعدة الصريحة "لا تثق بتقارير
Milestone السابقة، افحص الكود الفعلي"): حقل `Company.status`
(`CompanyStatus`: `active | suspended`) كان **موجودًا في الـschema منذ
Phase 1 لكن غير مُفعَّل في أي مكان على الإطلاق** — لا Guard، لا Service،
لا Controller كان يقرأه أو يتحقق منه. هذا الـMilestone هو أول مرة يُفعَّل
فيها هذا الحقل فعليًا (ضمن `SubscriptionGuard`)، دون تغيير معناه أو
تكرار مفهوم دورة حياة منشأة جديد يتعارض معه.

## ما تم إنجازه

- **النموذج**: `Plan` (كتالوج عام بلا RLS، نفس معاملة `permissions`)،
  `Subscription` (سطر واحد فريد لكل منشأة، RLS FORCE كاملة)،
  `SubscriptionStatus` (`trialing|active|expired|suspended|cancelled`).
  `CompanyStatus` الموجود لم يتغيّر ولم يُستبدَل.
- **`SubscriptionService`**: المصدر المركزي الوحيد للمنطق — تحميل
  السياق مع اكتشاف كسول لانتهاء التجربة (`loadContext`، مع Backfill
  كسول لأي منشأة قديمة بلا سطر اشتراك)، فحص الميزات (`hasFeature`)،
  إنفاذ حدود الاستخدام بقفل صف حقيقي (`assertWithinLimit`)، عرض التاجر
  (`getMerchantView`)، كتالوج الخطط (`listPlans`)، ودوال انتقال جاهزة
  لمركز تحكم مستقبلي دون تعريضها عبر أي مسار API.
- **`SubscriptionGuard`** (`APP_GUARD` عام بعد `PermissionsGuard`):
  سلسلة التفويض الكاملة "مُصادَق → وصول مستأجر → RBAC → صلاحية اشتراك →
  تحقق عمل" — منشأة موقوفة تمنع كل شيء ما عدا المسارات المُعفاة، اشتراك
  مقيَّد يمنع الطلبات المُغيِّرة فقط (القراءة تبقى متاحة)، و
  `@RequireFeature` يمنع ميزة غير مشمولة بالخطة بغض النظر عن الحالة أو
  RBAC.
- **حدود استخدام آمنة للتزامن** على 3 موارد فقط (مستخدمون/فروع/مبيعات
  شهرية) — قفل `SELECT ... FOR UPDATE` على سطر الاشتراك قبل العدّ
  والمقارنة، مُختبَر صراحة بطلبين متزامنين حقيقيين (`Promise.all`) على
  آخر مقعد متاح.
- **التسجيل**: كل منشأة جديدة تحصل تلقائيًا على اشتراك تجريبي (14 يومًا،
  خطة Professional) ضمن نفس معاملة التسجيل.
- **API التاجر**: `/subscriptions/me`, `/subscriptions/plans` — قراءة
  فقط، بلا أي endpoint تعديل (لا تغيير خطة، لا تمديد تجربة، لا تغيير حد)
  يصل إليه التاجر، تحضيرًا لمركز تحكم مستقبلي دون كشف مسارات امتيازية
  الآن.
- **Audit**: أحداث دورة حياة اشتراك حقيقية (إنشاء، بدء تجربة، انتهاء
  تجربة) — لا Audit على القراءة.
- **الواجهة الأمامية**: صفحة `/subscription` جديدة (خطة/حالة/أيام
  متبقية/ميزات/استخدام/كتالوج خطط)، وشريط تنبيه عام في `Layout.tsx` عند
  التقييد أو اقتراب انتهاء التجربة. لا زر دفع، لا Checkout وهمي — رسالة
  صادقة "تواصل مع الدعم" بدلًا من ذلك.

## قرارات مُتعمَّدة بلا تعقيد زائد

- **لا حالة `past_due`**: بلا تكامل تحصيل دفع خارجي، لا حدث حقيقي ينتج
  "فشل دفع" — كانت ستكون Enum زخرفيًا. `expired` (انتهاء تجربة) تغطي
  السلوك المطلوب.
- **لا جدول عدّاد استخدام منفصل**: الموارد الثلاثة قليلة العدد ورخيصة
  الاشتقاق بـ`COUNT(*)` تحت قفل حقيقي — تخزين عدّاد منفصل كان
  Denormalization بلا مبرر أداء.
- **لا Backfill مباشر في الـmigration**: `subscriptions` يحمل RLS FORCE
  والدور المُستخدَم للـmigrations ليس Superuser/BYPASSRLS — أي إدراج
  عابر للمستأجرين كان سيُمنَع صامتًا. الحل: إنشاء كسول ضمن معاملة
  tenant-scoped صحيحة عند أول طلب، بنفس آلية اكتشاف انتهاء التجربة.
- **خطتا Starter/Professional فقط، تسعير placeholder صريح**: لا تسعير
  تجاري حقيقي معروف بعد — `priceMonthlySar` موسوم بوضوح كسعر تقديري
  مبدئي في الواجهة والوثائق، وليس قرارًا تجاريًا نهائيًا.

## Tests
Backend: **209/209** e2e (195 سابق + 14 جديد في
`test/milestone8.e2e-spec.ts`: اشتراك تجريبي افتراضي، كتالوج خطط،
Audit تسجيل، صلاحيات ميزات مبنية على الخطة رغم RBAC كاملة (Owner)، حدود
استخدام تسلسلية ومتزامنة لثلاثة موارد، دورة حياة تجربة وانتهاؤها،
إيقاف منشأة، عزل مستأجرين مباشر عبر RLS). Frontend: **47/47** Vitest
(43 سابق + 4 جديد في `SubscriptionPage.test.tsx`). Playwright: **4/4**
(نفس العدد، `golden-path.spec.ts` مُمدَّد بقسم اشتراك جديد، لا ملف
جديد). كلها أُعيد تشغيلها فعليًا في هذه الدورة ضد قاعدتي بيانات حقيقيتين
(dev وtest)، وليس نقلًا عن تقرير سابق.

## Build / Lint / Typecheck / Database
Backend build/lint/`tsc --noEmit`: PASS. Frontend build/lint/`tsc
--noEmit`: PASS. `prisma migrate status` على dev وtest: up to date، لا
drift.

## Tenant Isolation / RLS / RBAC / Branch Scope
PASS — RLS مُتحقَّقة مباشرة عبر استعلام SQL خام عابر للمنشآت لجدول
`subscriptions` الجديد، اختبار صريح يثبت أن لا endpoint تعديل موجود
أصلًا للتاجر (لا مسار IDOR على تغيير خطة منشأة أخرى لأنه لا يوجد مسار
تعديل بالمرة). RBAC + صلاحية اشتراك مُختبَران معًا صراحة (مالك بكل صلاحيات
RBAC لا يزال يُمنَع من ميزة غير مشمولة بالخطة).

## Accounting Integrity
PASS — لم يتغيّر أي مسار محاسبي موجود (`JournalService.postJournalEntry`
لم يُمَس). حدود الاستخدام والصلاحيات تعمل كبوابة **قبل** أي منطق محاسبي،
لا داخل معاملته — لا خطر على توازن القيود الموجودة.

## Docker
**BLOCKED BY ENVIRONMENT** — نفس القيد المُسجَّل منذ Milestone 2، لم
يتغيّر.

## CI
PARTIAL — `.github/workflows/ci.yml` لم يتغيّر، لم يُشغَّل فعليًا على
أي GitHub Actions runner حقيقي في هذه البيئة، نفس القيد المُسجَّل منذ
Milestone 2.

## Secret Scan
PASS — بحث شامل على كامل الـdiff والملفات الجديدة — لا تسريب حقيقي.

## قيد بيئة حقيقي اكتُشف وأُصلِح (ليس عِلّة في كود Milestone 8)
نفس فجوة `qeedha_auth_lookup` المُسجَّلة في تقرير Milestone 7 (منح
`GRANT USAGE`/`SELECT` مفقود في هذه الجلسة تحديدًا) ظهرت مجددًا في هذه
الجلسة الجديدة (بيئة حاوية مُهيَّأة من الصفر) — أُصلِحت بنفس السكربتين
المُوثَّقين مسبقًا (`prisma/manual-sql/001_...`/`002_...`)، بلا أي تغيير
كود. يُوصى بضمّ هذين السكربتين لخطوة تهيئة تلقائية في CI/سكربت provisioning
لتفادي تكرار هذا الاكتشاف يدويًا كل جلسة جديدة — ليس عائقًا حاجبًا
لهذا الـMilestone.

## القيود المعروفة (حقيقية، غير حاجبة)
- لا تكامل دفع خارجي حقيقي (قرار نطاق صريح، Milestone 9/Control Center
  المستقبلي).
- لا حالة `past_due` (قرار مُتعمَّد، راجع أعلاه).
- سباق تزامن نادر جدًا وذاتي الإصلاح: منشأة قديمة (سابقة لهذا الـMilestone)
  بلا سطر اشتراك تتلقى طلبين متزامنين تمامًا كأول طلب بعد الترقية — أحدهما
  قد يفشل بخطأ قيد فريد بدلًا من نجاح صامت؛ الطلب التالي ينجح دومًا (الصف
  أصبح موجودًا). لا خطر بيانات، ولا يؤثر على أي منشأة أُنشئت عبر التسجيل
  العادي (لديها الاشتراك من لحظة الإنشاء).
- Docker/CI غير مُختبَرين فعليًا في أي بيئة تطوير توفّرت حتى الآن (نفس
  القيد منذ Milestone 2).

## نطاق مستقبلي/خارجي (لم يُلمَس، ولن يُلمَس في هذا الـMilestone)
Qeedha Integration (Milestone 9) · Control Center · Website · Affiliate ·
ZATCA Phase 2 · تكامل دفع خارجي حقيقي · حالة `past_due` حقيقية · تسعير
تجاري نهائي · عملات متعددة · تكلفة مخزون متقدمة (FIFO/Lots) · تطبيق
موبايل أصلي · تحليلات متقدمة · Background Queues.

## Commit
سيُنشأ commit واحد يشمل كل تغييرات هذا الـMilestone (كود + وثائق) فور
اكتمال هذا التقرير.

## Push
NOT PUSHED — ولن يُدفَع في هذه الدورة تحت أي ظرف.

## Git Status
سيكون CLEAN فور إتمام الـcommit الواحد أعلاه.

---

# Milestone 9 — Qeedha Integration

**تاريخ**: 2026-08-17

## ملخص: ما هذا الـMilestone وما ليس

يبني طبقة تكامل **Inbound** فعلية: قيّدها (منصة مستقلة تمامًا، منفصلة عن
Qeedha B) تستدعي *واجهة API جديدة* داخل Qeedha B لتسوية دفعات على فواتير
موجودة أصلًا — عبر عقد API صريح وآمن، لا اعتماد على مخطط قاعدة بيانات
قيّدها الداخلي. **ليس** بناء اتجاه Outbound (Qeedha B تستدعي قيّدها كمزوّد
دفع عند الدفع في POS — لا يزال تصميمًا معماريًا بلا تنفيذ، موصوف في
`docs/QEEDHA_INTEGRATION.md` منذ Phase 3، لم يُمَس حرف واحد فيه). **ليس**
بناء Website، Affiliate، Control Center، ZATCA Phase 2، أو أي مزوّد تمويل
خارجي آخر. لا إعادة بناء لأي بنية تحتية موجودة — المصادقة/RBAC/RLS/Audit/
POS/Sales/Payments (Milestone 1-8) لم تُمَس؛ نُفِّذ التكامل كطبقة
Orchestration رقيقة فوقها فقط (`SalesService.recordExternalPayment` هو
نفس منطق `recordPayment` الموجود منذ Milestone 7 حرفيًا، بعد فصل داخلي
لدالة خاصة مشتركة `recordPaymentCore`).

## ما تم إنجازه

- **النموذج**: `IntegrationCustomerMapping`، `IntegrationTransaction`
  (جدولان جديدان، RLS FORCE كاملة) + 5 أعمدة جديدة على
  `IntegrationConnection` الموجود (`publicReference`، `secretHash`،
  `secretLastFour`، `systemMembershipId`، `revokedAt`). راجع
  `docs/DATABASE.md` §10.1 — بما فيها ملاحظة تسمية صريحة حول تشارك اسم
  `integration_transactions` مع جدول عام مؤجَّل غير مُنفَّذ فعليًا كان
  موصوفًا مسبقًا في التوثيق فقط.
- **العميل النظامي**: دور نظامي `Integration` غير قابل لتسجيل الدخول +
  مستخدم نظامي عام واحد (`status: disabled`) + عضوية تُنشأ كسولًا لكل
  منشأة عند أول ربط — يُتيح استدعاء `SalesService`/`CustomersService`
  الموجودتين بلا أي حالة استثنائية "بلا Actor" داخلهما.
- **`QeedhaConnectionService`/`Controller`**: دورة حياة ربط موجّهة للتاجر
  (JWT + RBAC عاديان) — ربط يُصدر مرجعًا عامًا وسرًّا يُعرَض مرة واحدة
  فقط، تدوير عند إعادة الربط، قطع اتصال يُبطل السر فورًا.
- **`QeedhaIntegrationAuthGuard`**: مصادقة خارجية كاملة منفصلة عن JWT
  (`Bearer <publicReference>.<secret>`)، تعيد استخدام `AuthLookupService`/
  دور Postgres `qeedha_auth_lookup` الموجود بدل آلية Bootstrap ثانية،
  مقارنة سر بوقت ثابت.
- **`QeedhaTransactionService`/`Controller`**: `customers/resolve`،
  `transactions` (تسوية دفعة على فاتورة موجودة، لا بيع جديد)،
  `transactions/:reference` (استعلام)، `transactions/:reference/cancel`
  (قاعدة إلغاء حاسمة: فاشلة → تُلغى بأمان، ناجحة → `409` دائمًا، لا محرك
  عكس محاسبي جديد).
- **Idempotency وتزامن**: قيد Unique حقيقي (`Payment.clientReferenceId`)
  لتسوية المعاملات المكررة (مُختبَر بـ10 طلبات متزامنة حقيقية، معاملة
  واحدة فقط تُنشأ)؛ قفل Postgres Advisory (تقنية جديدة في هذا المستودع)
  لسباق حل عميل خارجي مكرر — كلاهما قيد قاعدة بيانات حقيقي، لا قفل ذاكرة.
- **RBAC**: صلاحيتان جديدتان فقط (`integration.read`، `integration.manage`)
  — `Owner` يملكهما تلقائيًا، لا صلاحية جديدة على المسارات الخارجية (سر
  فقط، لا RBAC بشري هناك).
- **الواجهة الأمامية**: صفحة `/integration` جديدة (عرض حالة/ربط يعرض
  السر مرة واحدة/قطع اتصال بتأكيد صريح) — لا شاشة إرسال معاملات (قيّدها
  تستدعي الـAPI مباشرة، ليس عبر متصفح التاجر)، لا بيانات وهمية.

## قرارات مُتعمَّدة بلا تعقيد زائد

- **تسوية دفعة، لا بيع جديد**: حمولة الطلب الخارجي لا تحمل بنود بضاعة —
  التصميم الوحيد المنطقي هو تسوية AR على بيع مكتمل، لا محرك بيع/دفع ثانٍ.
- **لا `PENDING` مزيّف**: المعالجة متزامنة بالكامل — `SUCCESS`/`FAILED`
  فقط، `PENDING` كانت ستكون حالة مزيَّفة بلا عمل غير متزامن حقيقي وراءها.
- **لا جدول Mapping لمرجع الفرع/الفاتورة**: `Branch.code`/
  `Invoice.invoiceNumber` الموجودان أصلًا مرجعان خارجيان آمنان بالفعل —
  بناء جدول Mapping إضافي كان Denormalization بلا داعٍ.
- **لا Webhooks جديدة**: كل استجابة متزامنة وفورية، لا حدث حقيقي يستوجب
  Push خارج — صندوق الوارد العام الموجود (Phase 1) يبقى جاهزًا بلا تعديل
  لأي احتياج مستقبلي حقيقي.
- **لا إلغاء لمعاملة ناجحة**: لا آلية آمنة في هذا المستودع لعكس دفعة واحدة
  بمعزل عن سلة بيع كاملة — `409` حاسم بدل اختراع محرك عكس محاسبي جديد.

## Tests
Backend: **242/242** e2e (209 سابق + 33 جديدة في
`test/milestone9.e2e-spec.ts`، تغطي 25 سيناريو مسمّى من مواصفة الـMilestone:
ربط/مصادقة/بيانات اعتماد خاطئة/إلغاء ربط/ربط عميل/ربط تاجر/ربط فرع/معاملة
ناجحة/معاملة مكررة/**10 طلبات متزامنة حقيقية**/استعلام/إلغاء وثباته/عزل
مستأجرين/RLS مباشر/RBAC/نطاق فرع/مبلغ وعملة غير صحيحين/مراجع غير صحيحة/
أحداث تدقيق/سلامة مالية ومخزون). Frontend: **53/53** Vitest (47 سابق + 6
جديدة في `QeedhaIntegrationPage.test.tsx`). Playwright: **4/4** (نفس
العدد، `golden-path.spec.ts` مُمدَّد بقسم تكامل قيّدها جديد، لا ملف جديد).
كلها أُعيد تشغيلها فعليًا في هذه الدورة ضد قاعدتي بيانات حقيقيتين (dev
وtest) وخادم backend/frontend حقيقيين، وليس نقلًا عن تقرير سابق.

## Build / Lint / Typecheck / Database
Backend build/lint (`eslint --max-warnings=0`)/`tsc --noEmit`: PASS.
Frontend build/lint/`tsc --noEmit`: PASS. `prisma migrate status` على dev
وtest: up to date، لا drift.

## Tenant Isolation / RLS / RBAC / Branch Scope
PASS — RLS مُتحقَّقة مباشرة عبر استعلام `prisma.withTenant` عابر للمنشآت
على `integration_connections`/`integration_customer_mappings`/
`integration_transactions`. رمز تكامل منشأة A مُختبَر صراحة أنه لا يمكنه
حل/استعلام أي شيء يخص منشأة B حتى بمرجع خارجي مشترك تمامًا. RBAC مُختبَر
لكلتا الصلاحيتين الجديدتين على المسارات الموجّهة للتاجر فقط (المسارات
الخارجية تعتمد على المصادقة بالسر حصرًا، لا RBAC).

## Accounting Integrity
PASS — قيد التسوية متوازن (مدين = دائن) في اختبار مخصَّص، الذمم تصفر بعد
تسوية كاملة، بيانات الدفعة (`method`/`providerKey`/`externalReference`/
`idempotencyKey`) صحيحة، لا حركة مخزون أو تغيّر متوسط تكلفة إضافي ناتج عن
تسوية الدفعة (لأنها ليست بيع بضاعة)، لا قيد محاسبي مكرَّر عند إعادة إرسال
نفس المعاملة (مُختبَر بطلب مكرر وبـ10 طلبات متزامنة حقيقية معًا).

## Docker
**BLOCKED BY ENVIRONMENT** — نفس القيد المُسجَّل منذ Milestone 2، لم
يتغيّر.

## CI
PARTIAL — `.github/workflows/ci.yml` لم يتغيّر، لم يُشغَّل فعليًا على أي
GitHub Actions runner حقيقي في هذه البيئة، نفس القيد المُسجَّل منذ
Milestone 2.

## Secret Scan
PASS — بحث شامل على كامل الـdiff والملفات الجديدة — لا تسريب حقيقي (لا
سر Qeedha حقيقي موجود أصلًا، لا بيانات اعتماد إنتاجية في أي ملف).

## قيد بيئة حقيقي اكتُشف وأُصلِح (ليس عِلّة في كود Milestone 9)
نفس فجوة `qeedha_auth_lookup` المُسجَّلة في تقارير Milestone 7/8 (منح
`GRANT USAGE`/`SELECT` مفقود في حاوية هذه الجلسة الجديدة تحديدًا، بما
فيها الامتداد الجديد `003_auth_lookup_role_integration.sql`) ظهرت مجددًا
— أُصلِحت بإعادة تطبيق السكربتات الثلاثة (001/002/003) يدويًا عبر `psql`
على كلتا القاعدتين، بلا أي تغيير كود. يُوصى (كما في التقارير السابقة)
بضمّ هذه السكربتات لخطوة تهيئة تلقائية في CI/سكربت provisioning.

كذلك: حد معدل الطلبات الأصلي على `POST /qeedha-integration/connection`
(10 طلب/60 ثانية، مبني على IP) كان يمنع مجموعة الاختبارات الخلفية نفسها
من الاكتمال (كل طلب اختبار جديد من نفس عملية Jest يشارك نفس IP محلي) —
رُفع إلى 40/60 ثانية (نفس رتبة حد تسجيل منشأة جديدة، لا يزال أضيق بكثير
من الافتراضي العام 100/60) بعد التأكد أن هذا لا يخفف حماية حقيقية (عملية
نادرة لكل منشأة في الإنتاج) بل يلائم حجم اختبار واقعي — قرار مُوثَّق في
كود الـController نفسه.

## القيود المعروفة (حقيقية، غير حاجبة)
- **لا اختبار ضد بيئة قيّدها خارجية حقيقية** — لا بيانات اعتماد أو بيئة
  قيّدها فعلية متاحة لهذه الجلسة. كل اختبار يستدعي هذا الـAPI فعليًا
  بحمولات بشكل العقد الموثَّق (لا Mock داخلي)، لكن هذا يتحقق من العقد
  والسلوك محليًا، وليس تكاملًا إنتاجيًا حقيقيًا.
- **حد معدل الطلبات مبني على IP لا على الربط**: قيد مُوثَّق بصدق في
  `docs/SECURITY.md`/`docs/QEEDHA_INTEGRATION.md` — إن شاركت عدة منشآت
  IP قيّدها الصادر، الحد يُطبَّق تراكميًا عليها.
- **لا Webhooks جديدة** (قرار نطاق: لا حدث حقيقي غير متزامن يستوجبها في
  هذا التصميم المتزامن بالكامل).
- **لا إلغاء لمعاملة ناجحة** (قرار سلامة محاسبية مُتعمَّد، راجع أعلاه —
  ليس قصورًا تقنيًا).
- Docker/CI غير مُختبَرين فعليًا في أي بيئة تطوير توفّرت حتى الآن (نفس
  القيد منذ Milestone 2).

## نطاق مستقبلي/خارجي (لم يُلمَس، ولن يُلمَس في هذا الـMilestone)
Milestone 10 (الإصدار الإنتاجي النهائي) · اتجاه Outbound الفعلي (Qeedha
B تستدعي قيّدها كمزوّد دفع، لا يزال تصميمًا فقط) · Website · Affiliate ·
Control Center · ZATCA Phase 2 · مزوّدو تمويل خارجيون آخرون · تطبيق
موبايل أصلي · عملات متعددة · تحليلات متقدمة.

## Commit
سيُنشأ commit واحد يشمل كل تغييرات هذا الـMilestone (كود + وثائق) فور
اكتمال هذا التقرير.

## Push
NOT PUSHED — ولن يُدفَع في هذه الدورة تحت أي ظرف.

## Git Status
سيكون CLEAN فور إتمام الـcommit الواحد أعلاه.
