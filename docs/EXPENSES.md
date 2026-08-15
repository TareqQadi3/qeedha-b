# المصروفات (Expenses) — Domain Transaction

راجع `docs/ACCOUNTING.md`/`docs/JOURNAL_ENTRIES.md` للقيود المحاسبية
الناتجة، و`docs/CHART_OF_ACCOUNTS.md` لمفهوم Account Mapping الذي تعتمد
عليه فئات المصروفات.

## النموذج

`Expense` يحمل: `companyId`، `branchId` **اختياري** (انظر أدناه)،
`categoryId`، `amount`، `currency`، `paymentMethod`، `description`
اختياري، `reference` اختياري، `status` (`recorded`/`cancelled`)،
`clientReferenceId` (مفتاح idempotency)، `actorMembershipId`،
`cancelledAt`. علاقة `category` (`ExpenseCategory`).

## الفرع اختياري — مصروف على مستوى المنشأة

بعكس `Sale`/`Purchase` (اللذين يشتقان `branchId` إلزاميًا من المستودع)،
`Expense.branchId` **اختياري صراحة**. مصروف حقيقي كثير لا ينتمي لفرع واحد
(اشتراك برمجيات للمكتب الرئيسي، رسوم بنكية عامة، إيجار مقر إداري) —
إجباره على فرع كان سيُنتج بيانات مضللة. حين يُرسَل `branchId`، يُتحقَّق
أنه ينتمي للمنشأة ويخضع لنفس فحص نطاق الفرع (`BranchScopeService`) الذي
تخضع له عمليات `Sale`/`Purchase`؛ حين يُترَك فارغًا، لا فحص نطاق فرع إطلاقًا
— أي عضو يملك `expenses.create` يستطيع تسجيل مصروف على مستوى المنشأة.

**ملاحظة**: المصروفات **لا تلمس `Warehouse` إطلاقًا** — بعكس المشتريات،
لا حقل `warehouseId` على `Expense` أصلًا؛ الفرع (إن وُجد) يُدخَل مباشرة،
وليس مُشتقًا من مستودع.

## طرق الدفع — نفس مجموعة Sale المحلية، بلا تجريد ثانٍ

`paymentMethod` مطلوب دائمًا (لا مصروف بلا طريقة دفع) ويقبل فقط القيم
المحلية الأربع `cash | card | transfer | other` — **نفس Enum
`PaymentMethod` المُستخدَم في `Payment.method` من المرحلة 3**
(`docs/PAYMENTS.md`)، وليس نوع بيانات منفصل. القيمة الخامسة `external`
**غير مقبولة هنا** (`CreateExpenseDto`/`UpdateExpenseDto` يقيّدان بـ
`@IsIn` على الأربع المحلية فقط) — لا معنى لمصروف "مدفوع عبر مزوّد خارجي"
في هذه المرحلة، ولا حاجة لأي حقل `providerKey`/`externalReference` هنا.

## المصروف "مدفوع دائمًا" — لا مفهوم "مصروف مستحق"

**قرار معماري جوهري**: كل مصروف في هذه المرحلة يُسجَّل بافتراض أنه **دُفع
بالفعل** لحظة إنشائه. لا حالة `pending`/`unpaid`، لا "مصروف مستحق"
(Expense Payable) في دليل الحسابات، ولا خطوة "دفع مصروف" لاحقة منفصلة عن
تسجيله. هذا يُبسّط القيد المحاسبي الناتج إلى سطرين ثابتين فقط (مدين حساب
المصروف، دائن نقدية/بنك) بلا حالة وسيطة — إن احتاج التاجر مستقبلًا تسجيل
مصروف لم يُدفَع بعد، هذا يحتاج تصميمًا منفصلًا (ذمم دائنة تشغيلية عامة، لا
مقصورة على الموردين) غير مبني في هذه المرحلة.

## إدارة الفئات (Category Management) — قابلة للتوسيع، وليست قائمة مغلقة

`ExpenseCategory`: `companyId`، `name` (فريد لكل منشأة)، `accountId`
(الحساب المحاسبي الذي تُرحَّل إليه مصروفات هذه الفئة — الـ"Account
Mapping" الفعلي لكل فئة، راجع `docs/CHART_OF_ACCOUNTS.md`)، `isActive`.

كل منشأة جديدة تحصل تلقائيًا على **6 فئات افتراضية** عند التسجيل (داخل
نفس معاملة `AuthService.registerCompany`، بعد بذر دليل الحسابات
الافتراضي)، كل فئة مربوطة بحسابها المصروف المطابق:

| الفئة | الحساب المحاسبي المرتبط |
|---|---|
| الإيجار | `5020` — الإيجار |
| الكهرباء | `5030` — الكهرباء |
| النقل والمواصلات | `5040` — النقل والمواصلات |
| الصيانة | `5050` — الصيانة |
| المستلزمات | `5060` — المستلزمات |
| أخرى | `5090` — مصروفات أخرى |

هذه ليست Enum ثابتًا في الكود — `POST /expenses/categories` (صلاحية
`expenses.create`) يُنشئ فئة جديدة مخصصة في أي وقت، مربوطة إما بحساب مصروف
موجود (`accountId` مُرسَل صراحة، **يجب أن يكون من نوع `expense`** —
`404` إن لم يكن) أو، إن لم يُرسَل، بحساب `5090` (مصروفات أخرى) افتراضيًا.
اسم الفئة فريد لكل منشأة (`409` عند التكرار).

## Update و تأثيره على القيد المحاسبي

`PATCH /expenses/:id` (صلاحية `expenses.update`) يفرّق صراحة بين نوعين من
الحقول:

- **حقول مالية** (`amount`, `categoryId`, `paymentMethod`) — أي تغيير
  فيها يُعتبر `financiallyChanged`.
- **حقول عرضية فقط** (`description`, `reference`, `branchId`) — تُحدَّث
  مباشرة بلا أي أثر محاسبي.

عند `financiallyChanged`: يُبحَث عن القيد النشط الحالي للمصروف
(`JournalEntry` بـ`referenceType='Expense'`، `referenceId=<expenseId>`،
`status='posted'`)، **يُعكَس** عبر `JournalService.reverseJournalEntry`
(قيد جديد بمدين/دائن مقلوبين، الأصلي يُعلَّم `reversed` — لا تعديل مباشر
على أي سطر قيد قط)، ثم **يُرحَّل قيد جديد صحيح** بالقيم المحدَّثة. مُختبَر
صراحة: تعديل مبلغ مصروف يعكس القيد القديم وينشئ قيدًا جديدًا صحيحًا
(`test/phase4.e2e-spec.ts`). لا مصروف `cancelled` قابل للتعديل (`409`).

## الحذف — Soft Cancel، وليس حذفًا فعليًا

`DELETE /expenses/:id` (صلاحية `expenses.delete`) **لا يحذف الصف فعليًا**
— يُعلّم `Expense.status = cancelled` + `cancelledAt`، ويعكس القيد النشط
الحالي بنفس آلية التعديل أعلاه (بلا ترحيل قيد جديد بعد العكس، بعكس
التعديل — الحذف ينهي الأثر المحاسبي فقط، لا يستبدله بقيد آخر). حذف مصروف
محذوف بالفعل، أو تعديل مصروف محذوف → `409` في كلتا الحالتين. مُختبَر
صراحة (`test/phase4.e2e-spec.ts`).

## Idempotency

`clientReferenceId` (فريد لكل `(companyId, clientReferenceId)`) — **نفس
النمط الحرفي من `Sale`/`Purchase`**: مسار سريع + قيد تفرّد في قاعدة
البيانات كخط دفاع ثانٍ ضد سباق تزامن حقيقي (`ExpensesController` يلتقط
`P2002` ويُعيد جلب السجل الأصلي). مُختبَر بـ5 طلبات إنشاء مصروف متزامنة
حقيقية بنفس المفتاح → مصروف واحد فقط (`test/phase4.e2e-spec.ts`).

## علاقة المصروف بالمحاسبة

عند إنشاء (أو إعادة ترحيل بعد تعديل) مصروف، يُرحَّل قيد واحد:

| الحساب | مدين | دائن |
|---|---|---|
| حساب المصروف المرتبط بالفئة (`ExpenseCategory.accountId`) | `amount` | |
| الصندوق (`1010`) إن `paymentMethod = cash`، أو البنك (`1020`) لأي طريقة محلية أخرى | | `amount` |

**ملاحظة على الحساب الأول**: هذا مثال على `JournalLineInput.accountId`
(وليس `accountCode`) — لأن `ExpenseCategory.accountId` قد يُشير لحساب
مخصص لا يملك ترميزًا ثابتًا معروفًا مسبقًا في `ACCOUNT_CODES`
(`docs/CHART_OF_ACCOUNTS.md` "Account Mapping"). أما حساب النقدية/البنك
فيُحلّ دائمًا عبر `accountCode` الثابت — نفس دالة `cashOrBankAccountCode`
المستخدَمة في `SalesService`.

## نطاق الفروع (Branch Scope)

`BranchScopeService` (نفس الخدمة من المرحلة 2.1) يُفرَض فقط حين يحمل
المصروف `branchId` فعليًا — لصلاحيات `expenses.create`/`update`/`delete`
على التوالي. مصروف بلا `branchId` (مستوى المنشأة) لا يخضع لفحص نطاق فرع
لأنه لا فرع ليُقيَّد به أصلًا. مُختبَر صراحة: مصروف مرتبط بفرع خارج نطاق
العضوية → `403` (`test/phase4.e2e-spec.ts`).

## RBAC

- `expenses.read` — قراءة القوائم والتفاصيل والفئات.
- `expenses.create` — إنشاء مصروف **وإنشاء فئة مصروف جديدة** (نفس
  الصلاحية تغطي الاثنين — لا صلاحية `expenses.categories.manage` منفصلة).
- `expenses.update` — تعديل مصروف موجود.
- `expenses.delete` — حذف (إلغاء ناعم) مصروف.

## Audit

كل عملية تُسجَّل: `expenses.expense.create`، `expenses.expense.update`
(مع `beforeState`/`afterState` للحقول المالية)، `expenses.expense.delete`،
`expenses.category.create`. إضافة لذلك، كل ترحيل/عكس قيد يُنتج سجل Audit
مستقل من `JournalService` نفسه (`accounting.journal.post`/
`accounting.journal.reverse`) — راجع `docs/JOURNAL_ENTRIES.md`.

## ما لم يُبنَ بعد (موثَّق صراحة)

- **مصروف مستحق (Expense Payable)**: لا حالة "غير مدفوع" — كل مصروف مدفوع
  فورًا بافتراض التصميم. راجع "المصروف مدفوع دائمًا" أعلاه.
- **مرفق/إيصال (Receipt attachment)**: لا حقل تخزين ملف على `Expense` في
  هذه المرحلة.
- **موافقة/سير عمل (Approval workflow)** لمصروفات تتجاوز حدًا معينًا: غير
  مبني — أي عضو يملك `expenses.create` يسجّل مصروفًا فورًا بلا اعتماد.
