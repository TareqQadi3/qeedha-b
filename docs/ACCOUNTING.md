# المحاسبة (Accounting) — أساس Double-Entry + Milestone 1: Accounting Completion (منفَّذ)

> هذا الملف كان في المرحلة 1 مجرد تصميم مرجعي مؤجَّل ("يُبنى في المرحلة
> 4"). المرحلة 4 نفَّذته فعليًا (دليل الحسابات + القيود + التكامل
> التلقائي من Sale/Purchase/Expense). **Milestone 1: Accounting
> Completion** (بعد المرحلة 4 مباشرة، نفس اليوم) أضاف طبقة القراءة/
> الإدارة المحيطة: 4 تقارير مالية حية، Subledger ذمم مدينة/دائنة، أرصدة
> افتتاحية محاسبية، وفترات مالية قابلة للإقفال. للتفصيل الكامل لكل جزء
> من الأساس، راجع: `docs/CHART_OF_ACCOUNTS.md` (دليل الحسابات) و
> `docs/JOURNAL_ENTRIES.md` (القيود). هذا الملف نظرة عامة + جدول ربط +
> تفصيل Milestone 1 + قائمة "مؤجَّل" الكاملة المُحدَّثة.
>
> **Milestone 5 (لاحقًا، نفس الجلسة)**: طلب بناء بالضبط نفس النطاق
> الموصوف في هذا الملف (Trial Balance/GL/P&L/Balance Sheet/AR/AP/Fiscal
> Periods/Opening Balances) كفجوات ناقصة. مراجعة معمارية فعلية للكود
> أثبتت أنه **مُنفَّذ بالكامل مسبقًا** — لم يُبنَ أي جزء جديد منه. العمل
> الفعلي: إغلاق فجوات اختبار حقيقية فقط (Vitest للصفحات الثلاث أدناه،
> تمديد Playwright Golden Path، تحقق Audit Log صريح للفترات/الأرصدة
> الافتتاحية) — راجع `docs/PROJECT_STATUS.md` "Milestone 5" للتفصيل.
>
> **Milestone 6 (لاحقًا، جلسة جديدة)**: حسم قرار COGS/تقييم المخزون —
> **Weighted Average (متوسط مرجّح متحرك)**، مُنفَّذ فعليًا الآن. راجع قسم
> "COGS / تقييم المخزون (Milestone 6)" أدناه للتفصيل الكامل. قائمة
> "مؤجَّل" في نهاية هذا الملف حُدِّثت تبعًا لذلك — بند COGS أُزيل منها.

## المبدأ

Double-Entry حقيقي محدود النطاق: كل قيد يتوازن (مجموع مدين = مجموع
دائن)، ويُنشَأ **تلقائيًا فقط** من عمليات تشغيلية فعلية (بيع، استلام
شراء، مصروف) — **لا إدخال يدوي مزدوج على الإطلاق** (لا Endpoint لترحيل
قيد، راجع `docs/JOURNAL_ENTRIES.md`). فوق هذا الأساس، Milestone 1 بنى
طبقة تقارير/إدارة حية تقرأ من نفس دفتر الأستاذ مباشرة دون أي حالة
موازية — راجع "التقارير المالية" أدناه، وMilestone 6 أضاف تكلفة البضاعة
المباعة (COGS) الحقيقية بطريقة المتوسط المرجّح المتحرك — راجع "COGS /
تقييم المخزون" أدناه. هذا لا يزال **ليس نظام محاسبة كاملًا**: لا ذمم
مدينة فعلية (بلا بيع آجل أصلًا)، لا مرتجعات مبيعات/مشتريات، لا تسوية
بنكية — راجع "مؤجَّل" أدناه للقائمة الكاملة المُحدَّثة.

## الكيانات (تفصيل كامل في الملفات المرتبطة)

```text
Account         دليل الحسابات — شجري (asset/liability/equity/revenue/expense)
JournalEntry    قيد محاسبي — posted أو reversed فقط، بلا draft
JournalLine     بند القيد (مدين/دائن) — سطر واحد لكل حساب متأثر
```

راجع `docs/CHART_OF_ACCOUNTS.md` للنموذج الكامل و`docs/JOURNAL_ENTRIES.md`
لآلية الترحيل/العكس.

## حدود معاملة كل مصدر → المحاسبة

كل عملية تجارية تُرحّل قيدها **داخل نفس معاملة Prisma الذرّية** لتلك
العملية — فشل ترحيل القيد يُلغي العملية كاملة، ولا يمكن أبدًا أن توجد
عملية تجارية مكتملة بلا قيد مطابق، أو قيد بلا عملية تجارية تبرره.

| المصدر | نقطة الترحيل | الملف المرجعي |
|---|---|---|
| `Sale` مكتمل | داخل `SalesService.createSale` | `docs/SALES.md` |
| `Sale` مُلغى | داخل `SalesService.cancelSale` (عكس) | `docs/SALES.md` |
| `Purchase` مُستلَم | داخل `PurchasesService.receivePurchase` | `docs/PURCHASING.md` |
| `Expense` مُنشَأ | داخل `ExpensesService.createExpense` | `docs/EXPENSES.md` |
| `Expense` تعديل مالي | داخل `ExpensesService.updateExpense` (عكس + إعادة ترحيل) | `docs/EXPENSES.md` |
| `Expense` محذوف | داخل `ExpensesService.deleteExpense` (عكس) | `docs/EXPENSES.md` |

لا مصدر رابع. `PurchasesService.createPurchase` (الطلب قبل الاستلام) و
`PurchasesService.cancelPurchase` (إلغاء أمر لم يُستلَم بعد) **لا يُرحّلان
أي قيد** — لا أثر محاسبي قبل استلام فعلي للبضاعة.

## Account Mapping بإيجاز

لا حساب مُشار إليه بـUUID ثابت في أي كود — كل استدعاء يحل حسابًا إما عبر
ترميز ثابت (`ACCOUNT_CODES.CASH` → `AccountingService.getAccountByCode`)
أو عبر `accountId` مُحلّ مسبقًا من مصدر بيانات آخر (مثل
`ExpenseCategory.accountId`). التفصيل الكامل، بما فيه دليل الحسابات
الافتراضي المزروع لكل منشأة، في `docs/CHART_OF_ACCOUNTS.md`.

## سلامة القيد المحاسبي (Double-Entry Integrity)

`JournalService.postJournalEntry` هو نقطة العبور الوحيدة، ويرفض أي قيد
غير متوازن أو بقيمة صفرية — يُعامَل عدم التوازن كخلل داخلي في المُستدعي،
وليس خطأ مستخدم. التفصيل الكامل في `docs/JOURNAL_ENTRIES.md`.

---

# Milestone 1: Accounting Completion

طبقة قراءة/إدارة كاملة فوق أساس المرحلة 4، بلا أي تغيير على آلية الترحيل
نفسها (`JournalService.postJournalEntry`/`reverseJournalEntry` يبقيان
نقطة العبور الوحيدة). أربعة أجزاء: تقارير مالية حية، Subledger ذمم مدينة/
دائنة، أرصدة افتتاحية محاسبية، وفترات مالية قابلة للإقفال.

## التقارير المالية — طبقة استعلام موحَّدة (Shared Reporting Query Layer)

`AccountingReportsService` (`backend/src/modules/accounting/
accounting-reports.service.ts`) هي الطبقة التي تقرأ منها كل التقارير
الأربعة أدناه — **كل الأرقام مُشتقّة حية من `JournalLine`/`JournalEntry`
المُرحَّلة فعليًا (`status: 'posted'`)، ولا يوجد أي رصيد إجمالي مُخزَّن
بشكل منفصل يمكن أن ينحرف عن الدفتر**. كل تقرير يحترم نطاق الفرع
(`BranchScopeService.getScopeForPermission`) وصلاحية
`accounting.reports.view` الجديدة. Controller:
`accounting-reports.controller.ts` تحت `/accounting/reports/*`.

- **ميزان المراجعة (Trial Balance)** — `GET /accounting/reports/
  trial-balance?dateFrom&dateTo` — مجموع مدين/دائن لكل حساب ظهر في أي
  قيد ضمن المدى المطلوب، مع `totals.isBalanced` (مجموع كل الحسابات
  مدين = دائن دائمًا لأن كل قيد مصدره متوازن أصلًا).
- **دفتر الأستاذ (General Ledger)** — `GET /accounting/reports/
  general-ledger?accountId&dateFrom&dateTo` — حركات حساب واحد مع رصيد
  جارٍ (`runningBalance`) لكل سطر. عند تمرير `dateFrom`، يُحسَب
  `openingBalance` بشكل صحيح كصافي كل ما سبق ذلك التاريخ لنفس الحساب
  (وليس صفرًا) — استعلام `aggregate` منفصل بشرط `postedAt < dateFrom`
  قبل جلب أسطر المدى نفسه.
- **الأرباح والخسائر (Profit & Loss)** — `GET /accounting/reports/
  profit-and-loss?dateFrom&dateTo` — تفصيل حسابات الإيرادات/المصروفات +
  `netProfit`.
- **الميزانية العمومية (Balance Sheet)** — `GET /accounting/reports/
  balance-sheet?asOfDate` — أصول/خصوم/حقوق ملكية كما في الدفتر، **بالإضافة
  إلى بند "أرباح مرحّلة غير مقفلة" محسوب (وليس قيدًا مُرحَّلًا)**: راجع
  التوضيح الكامل أدناه — هذا القسم مُفصَّل عمدًا وليس مُبسَّطًا.

### بند "الأرباح المرحّلة غير المقفلة" في الميزانية العمومية — لماذا موجود، وكيف

لا يوجد في هذا النظام أي إجراء إقفال فترة (Period-Closing) يُنشئ قيدًا
فعليًا يُحرّك صافي الربح/الخسارة إلى حساب حقوق الملكية — قيود `Sale`/
`Expense` **لا تكنس صافي الدخل أبدًا** إلى أي حساب Equity حقيقي (لا يوجد
قيد إقفال من أي نوع في الكود، وهذا لم يتغيّر). نتيجة لذلك، لو اكتفت
الميزانية العمومية بجمع أرصدة حسابات `equity` المُرحَّلة فقط، لن تتوازن
أبدًا مع الأصول طالما هناك أي ربح أو خسارة في الفترة الحالية لم تُقفَل
بعد — وهذا متوقَّع في أي نظام محاسبي حقيقي **قبل** إقفال آخر السنة
المالية رسميًا.

`getBalanceSheet()` (في `accounting-reports.service.ts`) يعالج هذا
بأسلوب محاسبي معياري ومعروف (كيف تعرض غالبية أدوات المحاسبة الصغيرة
ميزانية عمومية حية قبل الإقفال الرسمي لنهاية السنة، وليس اختراعًا خاصًا
بهذا النظام): يستدعي `getProfitAndLoss()` نفسها (نفس مصدر البيانات،
بلا منطق مكرَّر) بـ`dateTo = asOfDate`، ويُضيف ناتج `netProfit` كسطر
إضافي واحد ضمن `equity[]` في الاستجابة:

```json
{
  "accountId": null,
  "accountCode": null,
  "accountName": "الأرباح المرحّلة غير المقفلة (لم تُقفل بقيد رسمي بعد)",
  "balance": 12,
  "computed": true
}
```

- **`computed: true` صريح** في استجابة الـAPI (لا `accountId`/
  `accountCode` — لأنه ليس حسابًا حقيقيًا من دليل الحسابات) — الواجهة
  الأمامية (`ReportsPage.tsx`) تعرض هذا البند بعلامة مميزة بصرية بدل
  دمجه بصمت مع بنود حقوق الملكية المُرحَّلة الحقيقية.
- **ليس قيدًا، ولا يُنشئ أي صف `JournalEntry`/`JournalLine`** — مجرد
  رقم محسوب وقت الاستجابة، يختفي ويُعاد حسابه في كل طلب تالٍ. `totals
  .totalEquity` = مجموع حسابات `equity` المُرحَّلة + هذا الرقم المحسوب،
  و`totals.isBalanced` يقارن الأصول بمجموع الخصوم + حقوق الملكية هذا —
  فتتوازن الميزانية دائمًا وقت العرض، دون أي وهم حول ما هو "مُرحَّل
  رسميًا" مقابل "محسوب للعرض فقط".
- راجع `docs/ACCOUNTING.md` "الفترات المحاسبية" أدناه لعلاقة هذا
  بمفهوم إقفال الفترة — إقفال فترة **لا** يُنشئ هذا القيد المفقود؛ فقط
  يمنع ترحيل قيود جديدة بأثر رجعي عليها. إجراء إقفال فعلي (قيد يُحرّك
  صافي الدخل فعليًا إلى Equity) يبقى قرارًا مؤجَّلًا — راجع "مؤجَّل"
  أدناه.

## ذمم العملاء والموردين (AR/AP Subledger)

`SubledgerService` (`subledger.service.ts`)، Controller
`subledger.controller.ts`، تقرأ بنفس مبدأ طبقة التقارير أعلاه (لا رصيد
مخزَّن منفصل) — تجمع أسطر `JournalLine` المُرحَّلة على حساب `1100` (ذمم
مدينة) أو `2010` (ذمم دائنة) حسب `referenceId`/`referenceType` لربطها
بعميل/مورد فعلي:

- `GET /accounting/ar/customers` (أرصدة كل العملاء) و`GET /accounting/
  ar/customers/:customerId` (كشف حساب مفصَّل) — صلاحية `accounting.ar
  .view`.
- `GET /accounting/ap/suppliers` (أرصدة كل الموردين) و`GET /accounting/
  ap/suppliers/:supplierId` (كشف حساب مفصَّل) — صلاحية `accounting.ap
  .view`.

**تحديث Milestone 7 — كان هذا القسم يصف AR كفارغ بنيويًا وAP كمتراكم
باتجاه واحد فقط؛ لم يعد ذلك صحيحًا.** كل من `AR/AP` الآن **يتحرك في
الاتجاهين** فعليًا: `1100` (ذمم مدينة) يزداد من بيع آجل/جزئي الدفع
(`SalesService.createSale`) ويتناقص من دفعة عميل
(`SalesService.recordPayment`) أو مرتجع مبيعات (`SalesReturnService`)؛
`2010` (ذمم دائنة) يزداد من استلام شراء (كما كان) ويتناقص من دفعة مورد
(`PurchasesService.recordPayment`) أو مرتجع مشتريات
(`PurchaseReturnService`). **لم يتغيّر أي سطر كود في `SubledgerService`
نفسها** — كل هذه العمليات الجديدة تُرحَّل بنفس `referenceType:'Sale'`/
`'Purchase'` + `referenceId: <معرّف البيع/الشراء الأصلي>` التي كانت
`listCustomerBalances`/`getCustomerStatement`/`listSupplierBalances`/
`getSupplierStatement` تُصفّي عليها أصلًا، فظهرت تلقائيًا بلا أي تعديل
هناك — راجع القسم الكامل "Milestone 7 — العمليات التجارية واكتمال
الأعمال" أدناه للتفاصيل الكاملة (القيود، الصلاحيات، التزامن، الواجهة).

## الأرصدة الافتتاحية المحاسبية (Opening Balance)

**مهم: هذا مفهوم مختلف تمامًا عن "الرصيد الافتتاحي" للمخزون** (`POST
/inventory/opening-balance`، `InventoryService.setOpeningBalance`،
`StockMovementType.opening_balance` — موجود منذ المرحلة 2، ولا علاقة له
بالمحاسبة). الرصيد الافتتاحي المحاسبي هنا يعني: تسجيل أرصدة بداية دفتر
الأستاذ (نقدية، رأس مال، إلخ) عند بدء استخدام النظام لأول مرة.

`OpeningBalanceService` (`opening-balance.service.ts`)، Controller
`opening-balance.controller.ts` تحت `/accounting/opening-balance`:

- **لا آلية ترحيل جديدة على الإطلاق** — الرصيد الافتتاحي مجرد
  `JournalEntry` عادي (`referenceType: 'OpeningBalance'`, `referenceId:
  companyId` نفسه — يجعله قابلًا للإيجاد مباشرة) يُرحَّل عبر نفس نقطة
  العبور الوحيدة `JournalService.postJournalEntry` — نفس فرض توازن
  مدين=دائن، بلا أي جدول أو منطق موازٍ جديد. على مستوى المنشأة فقط (بلا
  `branchId`) — دليل الحسابات وميزان الافتتاح ليسا خاصّين بفرع في هذا
  النظام.
- `GET /accounting/opening-balance` (الرصيد النشط الحالي أو `null`) —
  صلاحية `accounting.read`.
- `POST /accounting/opening-balance` (تسجيل رصيد جديد، `409` إن كان
  هناك رصيد نشط بالفعل — يجب عكسه أولًا) — صلاحية `accounting
  .opening_balance.manage`.
- `POST /accounting/opening-balance/reverse` (عكس عبر
  `JournalService.reverseJournalEntry` الموجودة أصلًا — مبدأ "عكس لا
  تعديل" محفوظ حرفيًا، `404` إن لم يوجد رصيد نشط) — نفس الصلاحية.

**"نشط" يعني**: `status: 'posted'` **و** `reversalOfEntryId: null` معًا
— قيد عكسي أيضًا `status: 'posted'` بشكل دائم (لا يُعلَّم `reversed`
أبدًا، هذا مبدأ عكس-لا-تعديل)، فلولا شرط `reversalOfEntryId: null`
لبقي أي رصيد افتتاحي جديد بعد عكس رصيد سابق مرفوضًا للأبد.

### حارس التزامن (Opening Balance Concurrency)

فهرس فريد جزئي (Partial Unique Index) على Postgres يضمن وجود رصيد
افتتاحي "نشط" واحد فقط لكل منشأة في كل الأوقات — حتى تحت سباق تزامن
حقيقي (طلبان متزامنان حقيقيان لإنشاء رصيد افتتاحي، مُختبَر صراحة في
`test/milestone1.e2e-spec.ts`):

```sql
CREATE UNIQUE INDEX "journal_entries_one_active_opening_balance"
  ON "journal_entries" ("company_id")
  WHERE "reference_type" = 'OpeningBalance' AND "status" = 'posted'
        AND "reversal_of_entry_id" IS NULL;
```

(`backend/prisma/migrations/
20260815223000_milestone1_opening_balance_concurrency_guard/
migration.sql`) — الطلب الخاسر في السباق يفشل بـ`P2002` عند الإدراج،
و`OpeningBalanceService.create()` يترجمه إلى `409`. شرط `reversal_of
_entry_id IS NULL` ضروري: قيد عكسي أيضًا `status='posted'` بشكل دائم
(كما أعلاه)، فبدون هذا الشرط سيصطدم أي رصيد افتتاحي جديد لاحقًا مع قيد
العكس القديم للأبد.

**عِلّة اكتُشفت وصُحِّحت خلال هذا الـMilestone**: كان
`JournalService.reverseJournalEntry` يُنشئ قيد العكس الجديد **قبل**
تعليم القيد الأصلي `reversed`، ما يخلق لحظة عابرة (ضمن نفس المعاملة)
يكون فيها كلا القيدين `status: 'posted'` معًا — ينتهك الفهرس الجزئي
أعلاه عمليًا. صُحِّح بإعادة الترتيب: القيد الأصلي يُعلَّم `reversed`
**أولًا**، ثم يُنشَأ قيد العكس. راجع `backend/src/modules/accounting/
journal.service.ts` للترتيب الحالي المُصحَّح.

## الفترات المحاسبية (Fiscal Periods)

`FiscalPeriodsService` (`fiscal-periods.service.ts`)، Controller
`fiscal-periods.controller.ts` تحت `/accounting/fiscal-periods`، جدول
جديد `fiscal_periods` (`id, company_id, name, start_date, end_date`
كلاهما `@db.Date`، `status: open|closed`, `closed_at`,
`closed_by_membership_id` — RLS FORCE + policy `tenant_isolation` مثل
كل جدول tenant آخر، migration
`20260815220000_milestone1_accounting_completion`):

- `GET /accounting/fiscal-periods` (قائمة) — صلاحية `accounting.read`.
- `POST /accounting/fiscal-periods` (إنشاء — `409` لفترة متقاطعة مع
  فترة موجودة، `400` إن كان `startDate > endDate`) — صلاحية `accounting
  .period.manage`.
- `POST /accounting/fiscal-periods/:id/close` و`POST /accounting/
  fiscal-periods/:id/reopen` (كلاهما `409` إن كانت الفترة في نفس الحالة
  بالفعل) — نفس الصلاحية.

**آلية الإنفاذ — بسيطة ومحدودة عمدًا**: `JournalService
.postJournalEntry` و`reverseJournalEntry` يستدعيان
`FiscalPeriodsService.assertTodayNotLocked(tx, companyId)` أول خطوة قبل
أي شيء آخر — إن كان **تاريخ اليوم** (لا يوجد ترحيل بأثر رجعي (Backdating)
في هذا النظام على الإطلاق؛ كل قيد يُرحَّل الآن، وقت وقوع العملية) يقع
ضمن فترة `closed`، يُرفَض الترحيل/العكس بـ`409`. **هذا لا يلمس أو يُعدّل
أي قيد مُرحَّل سابقًا بأي شكل** — مبدأ "عكس لا تعديل" محفوظ بالكامل؛
إقفال فترة يمنع فقط ترحيل قيود **جديدة** طالما اليوم يقع ضمنها، ولا أثر
له على التاريخ.

## RBAC — 5 صلاحيات جديدة

مُضافة في `backend/src/modules/iam/constants/permissions.ts`:
`accounting.reports.view`, `accounting.ar.view`, `accounting.ap.view`,
`accounting.opening_balance.manage`, `accounting.period.manage`.

توزيعها في `default-roles.ts` (Owner يملك الخمس تلقائيًا عبر
`ALL_PERMISSION_KEYS`):

| الدور | reports.view | ar.view | ap.view | opening_balance.manage | period.manage |
|---|---|---|---|---|---|
| Manager | ✓ | ✓ | ✓ | ✗ | ✗ |
| Accountant | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cashier | ✗ | ✗ | ✗ | ✗ | ✗ |
| Inventory Manager | ✗ | ✗ | ✗ | ✗ | ✗ |

Manager يرى التقارير والذمم (تشغيلي) لكنه لا يدير الأرصدة الافتتاحية
ولا الفترات المحاسبية (إدارية بحتة، محصورة بالمحاسب/المالك).

---

# COGS / تقييم المخزون (Milestone 6)

**القرار المُتَّخَذ: Weighted Average (متوسط مرجّح متحرك/Moving Weighted
Average)**، وليس FIFO. تم اتخاذه بعد مراجعة الكود الفعلي (لا افتراض
مسبق): `StockLevel` كان أصلًا صفًا واحدًا فقط لكل (Product, Warehouse) —
لا مفهوم Lot/Batch في أي مكان من المخطط (لا في Purchase/PurchaseItem، لا
في StockMovement، لا في StockAdjustment/StockCount). بناء FIFO كان
سيتطلب طبقة Cost Lot/Layer جديدة بالكامل عبر كل تدفقات المخزون (شراء،
بيع، تسوية، جرد، تحويل) في وقت واحد — تغيير معماري واسع جدًا لا يبرره
حجم المشروع الحالي. المتوسط المرجّح يناسب الشكل الحالي لـ`StockLevel`
بأقل تغيير هيكلي ممكن (عمود واحد جديد).

## الصيغة

لكل حركة **واردة** (quantity > 0):

```
new_average_cost =
  (quantity_on_hand × average_cost + quantity × effective_unit_cost)
  / (quantity_on_hand + quantity)
```

حيث `effective_unit_cost` هو `unitCost` المُمرَّر صراحة، أو (إن لم
يُمرَّر) `average_cost` الحالي إن كان هناك رصيد سابق (fallback محايد لا
يُغيّر المتوسط)، أو `Product.costPrice` إن لم يكن هناك أي رصيد سابق
إطلاقًا لهذا (Product, Warehouse) — أول استلام حقيقي لهذا المنتج في هذا
المستودع.

لكل حركة **صادرة** (quantity <= 0): `average_cost` **لا يتغيّر مطلقًا**
— فقط `quantity_on_hand` ينقص. قيمة الـCOGS للحركة الصادرة =
`|quantity| × average_cost` (نفس القيمة قبل وبعد الحركة، لأنها لم
تتغيّر).

## أين يعيش هذا فعليًا: `InventoryService.recordMovement`

**لم تُبنَ آلية كتابة موازية.** `recordMovement` (نقطة الكتابة الوحيدة
لـ`stock_levels` منذ Phase 2) تم تمديدها فقط: عمود `average_cost` الجديد
يُحدَّث ضمن **نفس عبارة الـUPDATE الذرّية المحروسة** التي تُحدِّث
`quantity_on_hand` (`docs/INVENTORY.md` "Concurrency") — وليس بكتابة
منفصلة لاحقة، لأن ذلك كان سيعيد فتح بالضبط نافذة التسابق (race) التي
وُجدت تلك العبارة الذرّية لإغلاقها أصلًا. كل الصيغة أعلاه، بما فيها
الـfallback، مُعبَّرة داخل جملة SQL واحدة (`CASE`/`COALESCE`)، فلا يوجد
قراءة-ثم-حساب-ثم-كتابة بلا حماية في أي مكان.

`InventoryValuationService` (جديد، `inventory-valuation.service.ts`)
طبقة رقيقة فوقها — `recordReceipt`/`recordIssue` — هي **المصدر الوحيد**
الذي يحسب مبلغ الـCOGS (`quantity × averageCost`، مُقرَّب عبر `round2`
الموجودة أصلًا)، بحيث لا يُعاد حساب هذه الصيغة في أكثر من مكان واحد عبر
`SalesService`/`PurchasesService`/`InventoryService`/`StockCountService`.

## مصادر التكلفة لكل نوع حركة (فُحصت من الكود الفعلي، لا افتراضًا)

| المصدر | التكلفة |
|---|---|
| استلام شراء (`PurchasesService.receivePurchase`) | `PurchaseItem.unitCost` دائمًا (موجود أصلًا، لم يتغيّر) |
| رصيد افتتاحي مخزون (`POST /inventory/opening-balance`) | حقل `unitCost` جديد **اختياري** على `SetOpeningBalanceDto`؛ إن حُذف يُستخدَم `Product.costPrice` (الرصيد الافتتاحي يبدأ دائمًا من كمية صفر، فلا "متوسط سابق" ليُستخدَم بدلًا منه) |
| تسوية زيادة (`POST /inventory/adjustments`, `quantityDelta > 0`) | حقل `unitCost` جديد **اختياري** على `AdjustStockDto`؛ إن حُذف: المتوسط الحالي إن وُجد رصيد سابق، وإلا `Product.costPrice` |
| تسوية نقصان (`quantityDelta < 0`) | التكلفة الحالية دائمًا (`average_cost` لا يتغيّر) |
| فرق جرد موجب ("وجدنا أكثر") | نفس fallback التسوية أعلاه — **لا حقل تكلفة جديد أُضيف لواجهة الجرد** (لا `UpdateStockCountLinesDto` حاليًا يحمل تكلفة لكل سطر)، قرار موثَّق أدناه في "القيود المعروفة" |
| فرق جرد سالب ("وجدنا أقل") | التكلفة الحالية دائمًا |
| تحويل بين مستودعين | التكلفة الفعلية للمستودع المصدر (يُقرأ من نتيجة حركة `transfer_out` نفسها، لا استعلام إضافي) — لا اختراع ولا فقدان قيمة أثناء النقل |
| عكس بيع (`return`، عند `cancelSale`) | `SaleItem.unitCost` **المُخزَّن وقت البيع نفسه** (وليس المتوسط الحالي) — راجع "المرتجعات" أدناه |

## التكامل المحاسبي: `Dr COGS (5010) / Cr Inventory (1200)`

`SalesService.createSale` يُضيف الآن سطرين لقيد البيع (بعد Cash/Bank و
Sales Revenue وVAT الموجودين أصلًا) **فقط إن كان مجموع الـCOGS > 0**:
`Dr 5010` بمجموع COGS كل أسطر البيع، `Cr 1200` بنفس المبلغ. القيمة تأتي
حصرًا من `InventoryValuationService.recordIssue` (لكل سطر) — **لا مسار
فيه يقرأ أي قيمة من العميل**؛ `CreateSaleDto`/`SaleItemInputDto` لا
يحملان أي حقل تكلفة أصلًا (`forbidNonWhitelisted` يرفض أي محاولة إرسال
`unitCost`/`cogs` من الواجهة بـ400). الحساب `5010` (تكلفة البضاعة
المباعة) كان مزروعًا منذ المرحلة 4 ومعلَّقًا "Reserved, unused" — أصبح
مُستخدَمًا فعليًا الآن، لم يُنشَأ حساب جديد.

`PurchasesService.receivePurchase` لم يتغيّر محاسبيًا (`Dr Inventory /
Dr VAT / Cr Accounts Payable` كما كان) — التغيير الوحيد هناك هو تمرير
`PurchaseItem.unitCost` إلى `InventoryValuationService.recordReceipt`
لتحديث المتوسط.

## المرتجعات (عند إلغاء بيع)

`SalesService.cancelSale` لم يتغيّر في مبدئه (عكس القيد عبر
`JournalService.reverseJournalEntry` الموجود أصلًا، الذي يقلب **كل**
سطور القيد الأصلي تلقائيًا — بما فيها سطرَي COGS/Inventory الجديدين، بلا
أي كود إضافي). ما تغيّر: حركة إعادة المخزون (`type: 'return'`) تستخدم
الآن `SaleItem.unitCost` **المُخزَّن وقت البيع نفسه** كتكلفة للإرجاع، لا
المتوسط الحالي — لأن المتوسط قد يكون تغيّر (شراء جديد بسعر مختلف) بين
البيع والإلغاء، واستخدام أي قيمة غير التكلفة الأصلية للسطر المُلغى يُفسد
المتوسط. مُختبَر صراحة (`test/milestone6.e2e-spec.ts`) بسيناريو تغيّر
تكلفة حقيقي بين البيع والإلغاء.

## البيانات القديمة (Legacy Data)

`SaleItem.unitCost` عمود جديد **قابل لأن يكون NULL** — كل سطر بيع
مُنشَأ قبل هذه المرحلة (لم يكن لديه COGS من الأساس) يبقى `NULL`. إن
أُلغِيَ بيع قديم كهذا بعد هذه المرحلة: `cancelSale` تمرر `unitCost:
undefined` لحركة الإرجاع، فيسري نفس الـfallback المحايد (المتوسط
الحالي) — لا قيمة تُخترَع. لم تُطبَّق أي Migration بيانات على السجلات
القديمة (لا `UPDATE sale_items SET unit_cost = ...`)، لأنه لا توجد قيمة
تاريخية حقيقية معروفة لتلك السطور أصلًا — وضع قيمة مُخمَّنة كان سيخالف
التعليمة الصريحة "لا تخترع تكلفة تاريخية".

`StockLevel.average_cost` عمود جديد بقيمة افتراضية `0` لكل صف قديم —
أول حركة **واردة** بعد هذه المرحلة على أي صف كهذا تُصحِّحه فورًا (تُعامَل
كأنها "أول استلام" لأن `quantity_on_hand` قد لا يكون صفرًا فعليًا، لكن
`average_cost` صفر — هذا يعني أن أول حركة واردة بعد الترقية على رصيد
قديم موجود ستُنتج متوسطًا مُشوَّهًا مؤقتًا حتى تُدخَل تكلفة صريحة؛ موثَّق
كقيد معروف أدناه).

## التقارير: P&L وGross Profit وBalance Sheet

`GET /accounting/reports/profit-and-loss` يُضيف حقلَين جديدَين
(إضافة متوافقة خلفيًا، لا Breaking Change): `costOfGoodsSold` (مُستخرَج
من صف حساب `5010` داخل `expenses[]` المحسوبة أصلًا، بلا استعلام إضافي)
و`grossProfit` (`totalRevenue - costOfGoodsSold`). `netProfit` كما كان
(`totalRevenue - totalExpense`، وCOGS الآن أحد مكوّنات `totalExpense`).
`GET /accounting/reports/balance-sheet` **لم يتغيّر إطلاقًا** — قيمة أصل
المخزون (`1200`) تُحسَب أصلًا من مجموع أسطر القيود المُرحَّلة على ذلك
الحساب، وبما أن الشراء يدين المخزون والبيع يُدين الآن COGS/يُدين Inventory
فعليًا، القيمة تبقى متسقة تلقائيًا بلا أي كود جديد في هذا التقرير.

## القيود المعروفة (Known Limitations)

- **تسويات/الجرد الآن تُرحِّل محاسبيًا (منذ Milestone 7)**: كانت هذه
  الفقرة تصف `InventoryService.adjustStock`/`StockCountService.complete`
  كغير مُرحِّلَين لأي قيد محاسبي — راجع القسم الكامل "Milestone 7 —
  العمليات التجارية واكتمال الأعمال" أدناه لكيفية إغلاق هذه الفجوة
  بالضبط (الحسابات الجديدة، آلية حساب القيمة الدقيقة، التزامن).
- **لا رصيد افتتاحي مخزون = رصيد افتتاحي محاسبي تلقائيًا**: لا يزال هذا
  صحيحًا كما هو — `POST /inventory/opening-balance` (كمية + تكلفة)
  **لا يُنشئ أي JournalEntry**. إن أراد التاجر أن ينعكس هذا في `1200`
  محاسبيًا، لا يزال عليه استخدام Accounting Opening Balance المنفصل
  يدويًا (Milestone 1) — لا ازدواج تلقائي، ولا خلط بين المفهومين، تمامًا
  كما طُلب. قرار متعمَّد لم يُطلَب تغييره في Milestone 7.
- **البيانات القديمة (Pre-Milestone-6)**: `StockLevel.average_cost` يبدأ
  من صفر لأي صف موجود مسبقًا حتى أول حركة واردة جديدة تُصحِّحه — راجع
  "البيانات القديمة" أعلاه.
- **مرتجعات المبيعات الجزئية أصبحت مبنيّة الآن (منذ Milestone 7)**:
  `cancelSale` نفسها لم تتغيّر (لا تزال إلغاءً كاملًا فقط) — لكن آلية
  منفصلة تمامًا (`SalesReturnService`) تدعم الآن مرتجعات جزئية/كاملة/
  متعددة على نفس البيع. راجع القسم الكامل أدناه.

## مثال محسوب (مُختبَر حرفيًا)

```text
رصيد افتتاحي:  10 وحدة × 10 = 100 (متوسط 10)
شراء:          10 وحدة × 20 = 200 → الإجمالي 20 وحدة، قيمة 300، متوسط 15
بيع 5 وحدات:   COGS = 5×15 = 75 → المتبقي 15 وحدة، قيمة 225
شراء:          10 وحدة × 30 = 300 → الإجمالي 25 وحدة، قيمة 525، متوسط 21
بيع 5 وحدات:   COGS = 5×21 = 105 → المتبقي 20 وحدة، قيمة 420
```

راجع `test/milestone6.e2e-spec.ts` — هذا المثال بالضبط اختبار واحد حقيقي
يتحقق من كل رقم أعلاه ضد الـAPI الفعلي.

---

## Milestone 7 — العمليات التجارية واكتمال الأعمال (Merchant Operations & Business Completion)

يُغلق هذا الـMilestone بالضبط الفجوات التي وثّقتها المراحل السابقة تحت
"مؤجَّل": بيع آجل حقيقي، دفعة لمورد، مرتجعات مبيعات/مشتريات جزئية،
ترحيل محاسبي للتسويات/الجرد، وتسوية بنكية/نقدية أساسية. **لم يُعَد بناء
أي بنية تحتية موجودة** — كل ميزة جديدة تمر عبر نفس نقطة العبور الوحيدة
`JournalService.postJournalEntry`، ونفس نمط `SELECT ... FOR UPDATE`
للتزامن، ونفس اصطلاح `clientReferenceId` للـIdempotency.

### البيع الآجل والذمم المدينة (Customer Credit Sales / AR)

`SalesService.createSale` كانت ترفض أي بيع لا يساوي مجموع دفعاته
الإجمالي بالضبط. الآن: `paymentsSum` قد يكون **أقل من أو يساوي**
`totalAmount` (لا يتجاوزه أبدًا — `400` إن تجاوز)، والفرق (`arRemainder`)
يُرحَّل `Dr` على حساب `1100` (ذمم مدينة) **ضمن نفس قيد البيع نفسه**، إلى
جانب أسطر `Cr Sales Revenue`/`Cr VAT Payable`/`Dr COGS`/`Cr Inventory`
كما كانت. أي `arRemainder > 0` **يتطلب `customerId`** إلزاميًا (`400` إن
غاب) — الذمم المدينة تخص عميلًا محددًا دائمًا، لا رصيدًا مجهول الهوية.

تسوية الرصيد لاحقًا: `POST /sales/:id/payments`
(`SalesService.recordPayment`) — `Dr Cash/Bank` حسب طريقة الدفع
`/ Cr Accounts Receivable`، بنفس `referenceType:'Sale', referenceId:
sale.id` الذي يقرأه `SubledgerService` أصلًا (**لا تعديل واحد** على
`subledger.service.ts` كان ضروريًا). الرصيد المستحق **غير مخزَّن أبدًا**
— يُعاد حسابه دائمًا `totalAmount - SUM(Payment.amount)` تحت قفل صف
(`SELECT id FROM sales ... FOR UPDATE`) قبل أي إدراج، فطلبا دفع متزامنان
حقيقيان على نفس البيع لا يمكن أن يُنتجا معًا دفعًا زائدًا يتجاوزه كل
منهما منفردًا (`409` لمن يتجاوز الرصيد المستحق). `Payment` اكتسب عمود
`client_reference_id` اختياري (`@@unique([companyId, clientReferenceId])`،
`NULL` متعدد مسموح في Postgres) لإعطاء هذا المسار Idempotency حقيقية دون
مساس بصفوف الدفع القديمة المُنشأة وقت إتمام البيع.

### دفعات الموردين والذمم الدائنة (Supplier Payments / AP)

نموذج جديد `SupplierPayment` (`purchase_id` **إلزامي**، على عكس
`Payment.sale_id` — كل دفعة تُسدِّد فاتورة شراء محددة دائمًا، لا رصيدًا
عامًا). `POST /purchases/:id/payments` (`PurchasesService.recordPayment`)
— `Dr Accounts Payable (2010) / Cr Cash/Bank`، بنفس نمط قفل الصف/
Idempotency/`referenceType:'Purchase'` أعلاه تمامًا. لا يُسمح بالدفع إلا
على أمر شراء بحالة `received` (`409` غير ذلك)، ولا يتجاوز الرصيد المستحق
(`409`).

### مرتجعات المبيعات (Sales Returns) — ليست إعادة تسمية لـ`cancelSale`

`SalesService.cancelSale` **لم تتغيّر إطلاقًا** — تبقى إلغاءً كاملًا
للبيع فقط. مرتجعات المبيعات آلية منفصلة تمامًا
(`SalesReturnService.createReturn`، نموذجا `SaleReturn`/`SaleReturnItem`
جديدان، بلا رقم تسلسلي بشري — يُشار إليهما بـUUID فقط، مثل
`StockAdjustment`/`StockTransfer`، وليس مثل `Invoice`/`Purchase`):

- تدعم إرجاع **كمية جزئية** من سطر بيع محدد (`saleItemId`)، وإرجاعات
  **متعددة** على نفس البيع — الكمية المتراكمة المُرجَعة تُحسَب من مجموع
  `SaleReturnItem` الموجودة فعلًا، تحت قفل صف على `sale_items`
  (`SELECT ... FOR UPDATE`) يُسلسِل طلبات الإرجاع المتزامنة على نفس
  السطر، فلا يمكن لطلبين متزامنين أن يتجاوزا معًا الكمية المتاحة للإرجاع
  (`400` لمن يتجاوزها).
- **تُعيد المخزون بتكلفة البيع الأصلية** (`SaleItem.unitCost`)، لا
  بمتوسط التكلفة الحالي — إن ارتفع/انخفض المتوسط بين البيع والإرجاع (شراء
  لاحق بسعر مختلف)، الإرجاع لا يزال يُقيَّم بالتكلفة التاريخية، تمامًا
  كما تفعل `cancelSale` أصلًا. لسطر تاريخي (Legacy) بـ`unitCost = NULL`:
  يُستخدَم fallback `recordMovement` الموثَّق (متوسط حالي إن وُجد رصيد، وإلا
  `Product.costPrice`) — ولأن مزج قيمة مع نفسها لا يُغيّر متوسطًا مرجَّحًا،
  القيمة المُعادة من `recordReceipt` بعد الكتابة تساوي تمامًا تكلفة الـ
  fallback المُستخدَمة، فلا تناقض في حساب عكس COGS.
- **قيد المرتجع**: `Dr Sales Returns (4020، حساب إيراد جديد، لكنه يُدان
  دائمًا فقط — يُخصَم صافيًا تلقائيًا من `totalRevenue` في `getProfitAndLoss`
  دون أي معالجة خاصة لحساب مضاد) / Dr VAT Payable (إن وُجدت ضريبة) / Cr
  [توزيع الاسترداد أدناه] `+` `Dr Inventory / Cr COGS` (بقيمة عكس COGS
  أعلاه، إن وُجدت).
- **سياسة توزيع الاسترداد (Refund Allocation)** — سياسة مُوثَّقة صراحة،
  وليست تخمينًا: يُخصَم أولًا من الذمم المدينة حتى **الرصيد المستحق
  الحالي** لهذا البيع تحديدًا (`totalAmount - SUM(Payment.amount)`)، وأي
  مبلغ متبقٍ يُردّ بطريقة **أول دفعة** مُسجَّلة على هذا البيع (أو `cash`
  إن لم توجد أي دفعة إطلاقًا — بيع آجل بالكامل لم يُسدَّد قط قبل إرجاعه).
  لا تقسيم نسبي متعدد الطرق — تبسيط متعمَّد موثَّق هنا لتفادي اختراع سلوك
  عمل غير مطلوب.

### مرتجعات المشتريات (Purchase Returns)

`PurchaseReturnService.createReturn`، نموذجا `PurchaseReturn`/
`PurchaseReturnItem` جديدان، بنية مطابقة لمرتجعات المبيعات لكن أبسط —
**لا تعديل نهائي على أمر الشراء الأصلي بأي شكل** (سجل معاملة منفصل تمامًا،
كما طُلب صراحة):

- كمية جزئية/كاملة/متعددة، فقط من كمية **مُستلَمة فعلًا**
  (`purchaseItem.quantity`)، بنفس آلية قفل الصف/التراكم أعلاه، ولا يُسمح
  بالإرجاع إلا لأمر شراء بحالة `received`.
- **خفض المخزون**: حركة صادرة عادية (`recordIssue`) لا تلمس `average_cost`
  إطلاقًا (كما تفعل أي حركة صادرة) — فتفشل بـ`409` إن كانت الكمية المتاحة
  فعليًا أقل من المطلوب إرجاعه (مثلًا جزء منها بيع بالفعل)، وهذا ضبط صحيح
  وليس خللًا.
- **قيمة القيد** تستخدم `PurchaseItem.unitCost` **الأصلية** (لا المتوسط
  الحالي) لحساب `Cr Inventory`، لتبقى مطابقة تمامًا لـ`Dr Accounts Payable`
  دون الحاجة لحساب "فروقات" (Variance) وسيط — نفس مبدأ "أعِد استخدام
  التكلفة التاريخية المحفوظة أصلًا" الذي تتبعه مرتجعات المبيعات. **لا حساب
  "مرتجعات مشتريات" منفصل في دليل الحسابات**: بما أن الشراء يُدين المخزون
  مباشرة (نظام Perpetual)، عكسه المتماثل هو ببساطة إعادة دائن لحساب
  `1200`/`1300` — قرار مُتعمَّد لتفادي اختراع حساب P&L غير ضروري.
- **القيد**: `Dr Accounts Payable (2010) / Cr Inventory (1200) / Cr VAT
  Receivable (1300، إن وُجدت)`. رصيد AP **يُسمَح** أن يصبح سالبًا (رصيد
  مدين) إن تجاوز المرتجع ما هو مستحق فعلًا — كأي حساب آخر في هذا النظام،
  لا معالجة خاصة له.

### محاسبة تسويات المخزون والجرد (Inventory Adjustment / Stock Count Accounting)

كانت `InventoryService.adjustStock` و`StockCountService.complete`
تُحدِّثان الكمية/متوسط التكلفة بشكل صحيح دون ترحيل أي قيد محاسبي — الفجوة
مُغلَقة الآن عبر **حسابين جديدين** فقط (لا اختراع تصنيف جديد بلا داعٍ):
`4030 — أرباح تسوية المخزون` (إيراد) و`5011 — مصروف تسوية/عجز المخزون`
(مصروف، يلي `5010` COGS مباشرة).

**الآلية**: `InventoryService.recordMovementWithValueDelta` (طريقة جديدة
مجاورة لـ`recordMovement` تمامًا، تستخدم نفس SQL الخام المُثبَت دون
تعديله) تأخذ لقطة `SELECT quantity_on_hand, average_cost ... FOR UPDATE`
**قبل** الكتابة (بعد ضمان وجود الصف عبر نفس `INSERT ... ON CONFLICT DO
NOTHING` الذي تستخدمه `recordMovement` نفسها لإنشائه)، ثم تُفوِّض الكتابة
الفعلية لـ`recordMovement` غير المُعدَّلة، ثم تحسب:

```
valueDelta = (متوسط جديد × كمية جديدة) − (متوسط قديم × كمية قديمة)
```

قيمة **دقيقة رياضيًا بالبناء** (مُشتقّة من نفس الأرقام التي تستخدمها صيغة
المتوسط المرجَّح نفسها، لا تقريب). القفل يبقى ممسوكًا لبقية نفس المعاملة،
فتُعيد `recordMovement` (على نفس الاتصال/المعاملة) استخدام القفل نفسه دون
أي تعارض ذاتي (Self-Deadlock) — أقفال الصفوف في Postgres محصورة بالمعاملة
لا بالجلسة. `InventoryValuationService.recordValuedAdjustment` غلاف رقيق
فوقها فقط (نفس نمط `recordReceipt`/`recordIssue` الموجود أصلًا).

- **تسوية يدوية** (`InventoryService.adjustStock`): إن `valueDelta > 0`
  → `Dr Inventory / Cr Inventory Adjustment Gain`؛ إن `< 0` → `Dr
  Inventory Adjustment Expense / Cr Inventory`. `valueDelta ≈ 0` (مثلًا
  تسوية كمية على منتج بلا قاعدة تكلفة) لا تُرحِّل أي قيد — لا شيء
  للترحيل، و`JournalService` نفسها ترفض قيدًا بقيمة صفرية.
- **إكمال جرد** (`StockCountService.complete`): يمر على كل سطر فرق عبر
  `recordValuedAdjustment`، لكنه يُجمِّع **ربحًا إجماليًا وخسارة إجمالية
  منفصلين** (`totalGain`/`totalLoss`) بدل صافي واحد — جرد يحتوي منتجًا
  "زائدًا" وآخر "ناقصًا" معًا يجب أن يُظهر **كلا** الرقمين الإجماليين
  الحقيقيين في القيد، لا رقمًا صافيًا واحدًا مُضلِّلًا قد يُخفي عجزًا
  حقيقيًا خلف ربح أكبر. القيد الواحد لكامل الجرد قد يحمل حتى 4 أسطر
  (`Dr Inventory/Cr Gain` إن `totalGain>0`، و`Dr Expense/Cr Inventory` إن
  `totalLoss>0`) — يبقى متوازنًا (مدين=دائن) دائمًا، وحساب المخزون نفسه
  يتصافى صحيحًا عبر الأسطر تلقائيًا.
- كلا المسارين يستخدمان **نفس محرك التقييم بالمتوسط المرجَّح** — لا محرك
  تكلفة مواز جديد أُنشئ.

### الفترات المحاسبية — لا تغيير (قرار مُتعمَّد)

أُعيد فحص `FiscalPeriodsService`/`JournalService` بالكامل في هذا
الـMilestone: آلية القفل الحالية (`assertTodayNotLocked` يرفض ترحيل/عكس
أي قيد تاريخه اليوم إن وقع ضمن فترة `closed`)، وبند "الأرباح المرحّلة غير
المقفلة" المحسوب في الميزانية العمومية (راجع أعلاه)، **لا يزالان كافيين
لنطاق هذا المنتج الحالي، ولا عيب حقيقي فيهما اليوم**. لم يُطلَب "إجراء
إقفال محاسبي فعلي" (قيد يكنس صافي الدخل فعليًا إلى Equity) بدليل واضح من
النموذج الحالي، ولا يوجد قرار عمل واضح لبنائه بشكل غير مُخمَّن — الهدف
هو الصحة التشغيلية، لا اكتمال نظري لنظام ERP كامل. **لا تعديل كود** في
هذا القسم — قرار توثيقي بحت، مسموح به صراحة ("Preserve it unless a real
defect exists").

### التسوية البنكية/النقدية (Bank/Cash Reconciliation) — أساس أدنى متعمَّد

`BankReconciliationService`، نموذج `BankReconciliation` جديد **بلا** جدول
مطابقة أسطر منفصل، **بلا** حالة مسودة/إكمال (الإنشاء = اكتمال فوري، غير
قابل للتعديل لاحقًا، تمامًا مثل `AuditLog`). `POST
/accounting/reconciliations` (صلاحية `accounting.reconciliation.manage`)
يأخذ `accountCode` (`1010` الصندوق أو `1020` البنك فقط)، `asOfDate`،
`statementBalance` (رقم يُدخله المستخدم يدويًا من كشف حساب حقيقي — **لا
اتصال ببنك خارجي بأي شكل**)، ويحسب `bookBalance` **من نفس مصدر بيانات
`JournalLine` الذي تقرأ منه كل التقارير الأخرى** (مجموع مدين−دائن على هذا
الحساب حتى نهاية `asOfDate`)، ثم `difference = statementBalance −
bookBalance`. `GET /accounting/reconciliations` (صلاحية `accounting.read`)
للقراءة.

**قرار نطاق مُتعمَّد وموثَّق صراحة**: مطابقة كل معاملة فردية بسطر كشف
حساب (Line-Level Matching) — وواجهة لذلك، وحالة "مطابق/غير مطابق" لكل
حركة — **غير مبنية عمدًا**. بناؤها يتطلب منظومة فرعية جديدة غير متناسبة
مع حجم هذا المنتج اليوم (واجهة مطابقة، تنسيق استيراد كشف حساب، حالة لكل
سطر). هذا التسجيل الأدنى (رصيد دفتري مُشتقّ + رصيد كشف حساب + فرق) يبقى
حلًا آمنًا للإنتاج ومفيدًا فعليًا دون هذا التعقيد، ونطاقه مُوثَّق هنا بدل
تُرك فجوة صامتة.

### الحسابات الجديدة في دليل الحسابات

| الرمز | الاسم | النوع | الأصل |
|---|---|---|---|
| `4020` | مرتجعات المبيعات | إيراد (يُدان فقط) | فرع من `4000` |
| `4030` | أرباح تسوية المخزون | إيراد | فرع من `4000` |
| `5011` | مصروف تسوية/عجز المخزون | مصروف | فرع من `5000`، يلي `5010` |

تُزرَع تلقائيًا لكل منشأة جديدة عبر
`AccountingService.seedDefaultChartOfAccounts` كما هو الحال مع كل حساب
افتراضي آخر. للمنشآت المُسجَّلة **قبل** هذا الـMilestone: migration
`20260817000000_milestone7_merchant_operations` تُدرِج الحسابات الثلاثة
الناقصة لكل منشأة موجودة فعلًا (idempotent عبر `NOT EXISTS`، لا صفوف
مكرَّرة إن أُعيد تشغيلها).

### RBAC — 5 صلاحيات جديدة

`sales.payment.record`, `sales.return`, `purchases.payment.record`,
`purchases.return`, `accounting.reconciliation.manage` — مُضافة في
`permissions.ts`. التوزيع في `default-roles.ts` (Owner يملك الخمس تلقائيًا):

| الدور | sales.payment.record | sales.return | purchases.payment.record | purchases.return | accounting.reconciliation.manage |
|---|---|---|---|---|---|
| Manager | ✅ | ✅ | ✅ | ✅ | ❌ |
| Cashier | ✅ | ❌ | ❌ | ❌ | ❌ |
| Accountant | ❌ | ❌ | ✅ | ❌ | ✅ |
| Inventory Manager | ❌ | ❌ | ❌ | ✅ | ❌ |

المنطق: تحصيل دفعة عميل عملية تشغيلية يومية (Manager+Cashier+Owner)؛
مرتجع مبيعات قرار أكبر أثرًا (Manager+Owner فقط، يُستثنى Cashier، بنفس
منطق استثنائه من `sales.cancel` أصلًا)؛ دفع مورد وظيفة خزينة/محاسبة
(Manager+Accountant+Owner، يُطابق امتلاك Accountant لـ`accounting.manage`
أصلًا)؛ مرتجع مشتريات عملية مخزون/استلام (Manager+Inventory Manager+
Owner)؛ التسوية البنكية وظيفة محاسبية بحتة (Accountant+Owner، تُطابق نمط
`accounting.opening_balance.manage`/`accounting.period.manage`).

### التزامن (Concurrency) — ملخص موحَّد

كل ميزة أعلاه تستخدم **نفس النمط العام** لمنع سباقات التزامن الحقيقية —
`SELECT ... FOR UPDATE` على الصف الأب (`sales`/`purchases`/
`sale_items`/`purchase_items`/`stock_levels`) قبل قراءة/حساب أي قيمة
تراكمية (رصيد مستحق، كمية مُرجَعة سابقًا، متوسط تكلفة)، ضمن نفس معاملة
`withTenant` التي يُنشئ خلالها الصف الجديد ويُرحَّل القيد — لا فحص على
مستوى التطبيق فقط، بل قفل قاعدة بيانات حقيقي. مُختبَر صراحة (طلبات HTTP
متزامنة حقيقية، لا محاكاة) في `test/milestone7.e2e-spec.ts` لدفعات
البيع/الشراء.

---

## مؤجَّل — القائمة الكاملة (مرجع موحَّد، مُحدَّثة بعد Milestone 7)

هذا القسم هو المكان الوحيد الموثَّق فيه كل ما **لم يُبنَ عمدًا** في
المحاسبة حتى نهاية Milestone 7. عدة بنود من نسخ سابقة من هذه القائمة
(ذمم مدينة/دائنة Subledger، فترات مالية/إغلاق، تكلفة البضاعة المباعة/
تقييم المخزون، **بيع آجل، دفعة لمورد، مرتجعات مبيعات/مشتريات، ترحيل
تسويات/جرد، تسوية بنكية أساسية**) **بُنيت الآن فعليًا وأُزيلت من هنا** —
راجع الأقسام أعلاه. ما تبقّى:

- **إجراء إقفال فترة فعلي (Period-Closing Entry)**: إقفال فترة
  (`POST /accounting/fiscal-periods/:id/close`) يمنع فقط ترحيل قيود
  جديدة بأثر رجعي عليها — **لا يُنشئ قيد إقفال فعليًا يكنس صافي الدخل
  إلى حساب حقوق ملكية حقيقي**. بند "الأرباح المرحّلة غير المقفلة" في
  الميزانية العمومية (راجع أعلاه) هو حل عرض مؤقت ومحسوب، وليس بديلًا عن
  إجراء إقفال حقيقي — راجع "الفترات المحاسبية — لا تغيير" أعلاه لسبب عدم
  حسم هذا في Milestone 7 تحديدًا.
- **مطابقة أسطر التسوية البنكية (Line-Level Bank Reconciliation)**: راجع
  "التسوية البنكية/النقدية" أعلاه — تسجيل رصيد إجمالي/فرق فقط، لا مطابقة
  معاملة بمعاملة.
- **SaaS / الاشتراكات والفوترة**: خارج نطاق Milestone 7 — Milestone 8.
- **Qeedha Integration**: خارج النطاق — Milestone 9.
- **ZATCA Phase 2 / التوقيع الرقمي / الإرسال الفعلي**: راجع `docs/ZATCA.md`
  — خارج نطاق كل مرحلة حتى الآن.
- **عملات متعددة، تكلفة FIFO/Lot متقدمة، تطبيقات جوال، تحليلات متقدمة،
  بنية Background Jobs**: لم تُطلَب في أي مرحلة حتى الآن.
- **Qeedha Connector، Control Center، Website، الاشتراكات الفعلية،
  Affiliate، مزوّدو تمويل خارجيون**: لا شيء من هذا موجود في هذا الكود.

## قواعد ثابتة من المرحلة 1، لا تزال سارية

- **لا تعديل على قيد مُرحَّل** — فقط قيود عكسية (`reversalOfEntryId`).
  مُطبَّق حرفيًا الآن، لا تصميم مرجعي فقط.
- القيود التلقائية تمر بنفس مسار Audit Log مثل أي عملية حساسة أخرى
  (`accounting.journal.post`/`accounting.journal.reverse`).
