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

## المبدأ

Double-Entry حقيقي محدود النطاق: كل قيد يتوازن (مجموع مدين = مجموع
دائن)، ويُنشَأ **تلقائيًا فقط** من عمليات تشغيلية فعلية (بيع، استلام
شراء، مصروف) — **لا إدخال يدوي مزدوج على الإطلاق** (لا Endpoint لترحيل
قيد، راجع `docs/JOURNAL_ENTRIES.md`). فوق هذا الأساس، Milestone 1 بنى
طبقة تقارير/إدارة حية تقرأ من نفس دفتر الأستاذ مباشرة دون أي حالة
موازية — راجع "التقارير المالية" أدناه. هذا لا يزال **ليس نظام محاسبة
كاملًا**: لا تكلفة بضاعة مباعة (COGS)، لا ذمم مدينة فعلية (بلا بيع آجل
أصلًا)، لا مرتجعات مشتريات، لا تسوية بنكية — راجع "مؤجَّل" أدناه للقائمة
الكاملة المُحدَّثة.

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

**مهم جدًا — يجب فهمه قبل استخدام AR في الإنتاج**: `GET /accounting/ar/
customers` بنية حقيقية وعامة، ومُختبَرة (`test/milestone1.e2e-spec.ts`)،
لكنها **ستُعيد قائمة فارغة اليوم دائمًا**، وهذا **متوقَّع وليس خللًا**:
`CreateSaleDto` يرفض أي بيع لا يساوي مجموع دفعاته الإجمالي بالضبط — **لا
يوجد بيع آجل (Credit Sale/Deferred Payment) في هذا الكود على الإطلاق**،
فلا يُرحَّل أي سطر أبدًا إلى حساب `1100` (ذمم مدينة). `customerId` على
`Sale` يبقى مجرد علامة تعريفية (Tag) لا أثر محاسبي لها. بناء قدرة بيع
آجل فعلية قرار عمل مستقبلي منفصل تمامًا عن هذا الـMilestone، ولم يُطلَب
هنا. `ReceivablesPayablesPage.tsx` في الواجهة الأمامية تعرض نص Empty
State يشرح هذا صراحة لتبويب AR بدل أن يبدو النظام معطوبًا.

**AP على النقيض تمامًا مُعبَّأة فعليًا اليوم**: كل `Purchase` مُستلَم
يُرحّل دائمًا دائنًا لحساب `2010` (ذمم دائنة)، لذلك `GET /accounting/ap/
suppliers` يُعيد أرصدة حقيقية. لكن **لا خطوة "دفع لمورد" موجودة بعد في
أي مكان بالكود** — أي أن رصيد AP **لا يتناقص أبدًا**، فقط يتراكم مع كل
استلام شراء جديد. هذا قيد موثَّق ومعروف، ومنفصل تمامًا عن سبب فراغ AR
البنيوي (AR فارغ لأن لا مصدر بيانات إطلاقًا؛ AP يتراكم لأن مصدر البيانات
باتجاه واحد فقط) — لم يُطلَب حسمه في هذا الـMilestone.

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

## مؤجَّل — القائمة الكاملة (مرجع موحَّد، مُحدَّثة بعد Milestone 1)

هذا القسم هو المكان الوحيد الموثَّق فيه كل ما **لم يُبنَ عمدًا** في
المحاسبة حتى نهاية Milestone 1. أربعة بنود من نسخة نهاية المرحلة 4 من
هذه القائمة (ذمم مدينة/دائنة Subledger، فترات مالية/إغلاق) **بُنيت الآن
فعليًا وأُزيلت من هنا** — راجع الأقسام أعلاه. ما تبقّى:

- **تكلفة البضاعة المباعة (COGS) / تقييم المخزون**: لم يُتَّخَذ قرار
  بعد حول طريقة التقييم (FIFO أم متوسط مرجّح Weighted Average) — لم
  يُلمَس هذا القرار في Milestone 1 إطلاقًا. نتيجة لذلك، **قيد البيع لا
  يزال لا يحتوي أي سطر مخزون/COGS** (`SalesService.createSale`، راجع
  التعليق في الكود عند بناء `journalLines`) — قرار توقُّف وتوثيق
  متعمَّد، وليس تخمينًا أو إغفالًا. الحساب `5010` (تكلفة البضاعة
  المباعة) لا يزال مزروعًا في دليل الحسابات الافتراضي (`default-chart-
  of-accounts.ts`، معلَّق صراحة "Reserved, unused") لكنه غير مُستخدَم في
  أي قيد فعلي حتى يُحسَم هذا القرار. هذا القرار يمس مخطط قاعدة البيانات
  (جدول Cost Lot/Layer إن اختير FIFO) ومنطق ترحيل البيع معًا، لذا سُجِّل
  كـ"Decision Required" منفصل عن أي عمل تنفيذي آخر.
- **بيع آجل (Credit Sale / Deferred Payment)**: لا تزال `CreateSaleDto`
  ترفض أي بيع لا يتطابق مجموع دفعاته مع الإجمالي بالضبط — أساس ذمم
  مدينة `AR Subledger` مبنيّ الآن (راجع أعلاه) لكنه سيبقى فارغًا هيكليًا
  حتى تُبنى قدرة بيع آجل فعلية، وهذا قرار عمل مستقبلي منفصل لم يُطلَب في
  Milestone 1.
- **إجراء إقفال فترة فعلي (Period-Closing Entry)**: إقفال فترة
  (`POST /accounting/fiscal-periods/:id/close`) يمنع فقط ترحيل قيود
  جديدة بأثر رجعي عليها — **لا يُنشئ قيد إقفال فعليًا يكنس صافي الدخل
  إلى حساب حقوق ملكية حقيقي**. بند "الأرباح المرحّلة غير المقفلة" في
  الميزانية العمومية (راجع أعلاه) هو حل عرض مؤقت ومحسوب، وليس بديلًا عن
  إجراء إقفال حقيقي.
- **خطوة "دفع لمورد" (AP لا يتناقص)**: `Purchase` تُرحَّل إلى حساب ذمم
  دائنة **واحد إجمالي** (`2010`)، وSubledger الموردين (راجع أعلاه) يعرض
  رصيدًا صحيحًا لكل مورد الآن — لكن لا خطوة تسدد هذا الرصيد، فهو يتراكم
  دائمًا مع كل استلام شراء جديد.
- **مرتجعات المشتريات (Purchase Returns)**: راجع `docs/PURCHASING.md`
  "مرتجعات المشتريات" — الـSchema/التدفق مفتوحان للبناء لاحقًا، لم يُبنَيا.
- **التسوية البنكية/النقدية الكاملة (Cash/Bank Reconciliation)**: لا أداة
  لمطابقة كشف حساب بنكي بحركات النظام.
- **ZATCA / الفوترة الإلكترونية / QR / التوقيع الرقمي**: `Purchase`/`Sale`
  يخزّنان فقط المبلغ الخاضع للضريبة، مبلغ الضريبة، ونسبتها كأرقام عادية —
  لا UUID فاتورة إلكتروني، لا سلسلة هاش، لا إرسال فعلي لأي جهة. راجع
  `docs/ZATCA.md`.
- **Qeedha Connector، Control Center، Website، الاشتراكات الفعلية،
  Affiliate**: لا شيء من هذا موجود في هذا الكود — خارج نطاق كل مرحلة حتى
  الآن، وليس فقط Milestone 1.

## قواعد ثابتة من المرحلة 1، لا تزال سارية

- **لا تعديل على قيد مُرحَّل** — فقط قيود عكسية (`reversalOfEntryId`).
  مُطبَّق حرفيًا الآن، لا تصميم مرجعي فقط.
- القيود التلقائية تمر بنفس مسار Audit Log مثل أي عملية حساسة أخرى
  (`accounting.journal.post`/`accounting.journal.reverse`).
