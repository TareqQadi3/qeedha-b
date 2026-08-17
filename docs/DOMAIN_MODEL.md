# نموذج الهوية والمنشآت (Domain Model — Identity & Tenancy)

هذا الملف يوثّق نموذج الهوية النهائي بعد إعادة الهيكلة (Auth/IAM refactor)
التي سبقت المرحلة الثانية. يحل محل أي وصف سابق لعلاقة User↔Company في
`ARCHITECTURE.md`/`DATABASE.md` (تلك الملفات محدَّثة الآن لتعكس هذا النموذج).

## القاعدة الحاكمة

> **Qeedha Accounting منتج SaaS متعدد المستأجرين من اليوم الأول.**
> **المستخدم ليس مرتبطًا بمنشأة واحدة بالضرورة.**

`User = Company` افتراض خاطئ ولا يظهر في أي مكان بالكود. العلاقة الوحيدة بين
مستخدم ومنشأة هي `Membership` صريحة.

## الكيانات الخمسة

```text
User
 ├── Membership → Company A
 │      ├── MembershipRole → Role (مثلًا Manager)
 │      └── (نطاق الفرع اختياري لكل MembershipRole)
 │
 └── Membership → Company B
        ├── MembershipRole → Role (مثلًا Accountant)
        └── ...
```

### 1) `User` — الهوية الأساسية
- **عالمي، وليس ملكًا لأي منشأة.** لا يحمل `company_id`، ولا تخضع جدولته
  لـRow-Level Security إطلاقًا (لأنه ليس بيانات tenant من الأساس — هوية
  الشخص نفسها ليست "بيانات منشأة").
- `email`/`mobile` فريدان عالميًا (وليس لكل منشأة) — هذا مقصود ومطلوب: تسجيل
  الدخول يحتاج تحديد هوية المستخدم **قبل** معرفة أي منشأة سيعمل ضمنها.
- شخص واحد قد يملك عدة `Membership` (عدة منشآت) بنفس بيانات الدخول.

### 2) `Company` (Tenant) — المنشأة
كما في المرحلة 1، بلا تغيير: الجذر الذي تتبعه الفروع والمستودعات وكل البيانات
التجارية.

### 3) `Membership` — العلاقة الوحيدة بين User وCompany
- **هذا هو الكيان الوحيد الذي يربط مستخدمًا بمنشأة.** لا علاقة مباشرة أخرى.
- بيانات: `id, companyId, userId, status (active|suspended), createdAt, updatedAt`.
- **Tenant-scoped بالكامل**: يحمل `companyId`، ويخضع لـRLS (`FORCE ROW LEVEL
  SECURITY`) كأي جدول تجاري آخر.
- قيد فريد `(companyId, userId)` — عضوية واحدة فقط لكل شخص في كل منشأة.
- عضوية `suspended` تفقد صاحبها الوصول فورًا (`MembershipGuard`، انظر أدناه)
  حتى لو كان الـaccess token ما زال صالحًا فنيًا.

### 4) `Role` + `Permission` + `RolePermission` — كما في المرحلة 1
لم يتغيّر شكلها: دور مسمّى (نظامي أو مخصّص لمنشأة) يحمل حزمة صلاحيات. **الفرق
الجوهري هو أين يُسنَد الدور** (البند التالي).

### 5) `MembershipRole` — إسناد الدور (يحل محل `UserRole` القديم)
- **الدور يُسنَد إلى Membership، وليس إلى User مباشرة.** هذا يعني أن الشخص
  نفسه يمكن أن يكون **Manager في منشأة A و Accountant في منشأة B** في نفس
  الوقت — كل إسناد مستقل تمامًا عن الآخر.
- بيانات: `id, companyId (مُكرَّر لتبسيط RLS), membershipId, roleId, branchId
  (اختياري = نطاق الفرع)`.
- **Branch Scope**: `branchId = NULL` يعني صلاحية على مستوى المنشأة كاملة؛
  قيمة محددة تعني الصلاحية مقصورة على ذلك الفرع فقط لهذا الدور تحديدًا.

## Current Tenant Context — كيف "يعرف" أي طلب API أي منشأة يعمل ضمنها المستخدم

الـaccess token JWT يحمل ثلاثة حقول: `sub` (userId)، `companyId`،
`membershipId`. هذا الثلاثي هو الـ"Current Tenant Context" لكل طلب:

```json
{ "sub": "<userId>", "companyId": "<companyId>", "membershipId": "<membershipId>" }
```

- `membershipId` هو مفتاح كل فحص صلاحيات (`PermissionsGuard` يستعلم
  `MembershipRole` بـ`membershipId` مباشرة — لا حاجة لإعادة اشتقاق العضوية
  من `(userId, companyId)` في كل طلب).
- **لا يوجد مسار واحد في الـAPI يقبل `companyId` من العميل لتحديد النطاق.**
  دائمًا من الـtoken. محاولة إرسال `companyId` مختلف في الـBody/Query لا
  تُغيّر شيئًا لأن كل الخدمات تستخدم `user.companyId` من الـJWT context، لا
  من مدخلات الطلب.
- تبديل المنشأة (Tenant switching) **لا يعدّل** الـtoken الحالي — يُصدر
  **token جديدًا تمامًا** بعد التحقق الصريح من وجود Membership نشطة (انظر
  أدناه). لا "تلاعب" ممكن لأن كل عملية تبديل تمر بفحص قاعدة البيانات.

## تسجيل الدخول واختيار المنشأة (Login & Tenant Selection)

```text
POST /auth/login (identifier + password)
        │
        ▼
تحقق كلمة المرور (بحث عالمي في users - لا RLS على هذا الجدول)
        │
        ▼
جلب Memberships النشطة لهذا المستخدم (عبر دور DB منفصل، انظر SECURITY.md)
        │
   ┌────┴────┐
   │         │
عضوية      عضويتان
واحدة      أو أكثر
   │         │
   ▼         ▼
tokens    tenantSelectionToken
مباشرة    قصير الأجل (10 دقائق)
للـtenant  + قائمة المنشآت المتاحة
الوحيد         │
              ▼
     POST /auth/select-tenant
     (tenantSelectionToken + companyId)
              │
     تحقق Membership نشطة فعليًا لهذه المنشأة
     (عبر withTenant + RLS، وليس عبر الدور المتجاوز)
              │
              ▼
           tokens
```

- **عضوية واحدة → دخول مباشر بدون شاشة اختيار** (طلب صريح: لا تُرهق التاجر
  الذي لديه منشأة واحدة بخطوة غير ضرورية).
- **عضويتان أو أكثر → `tenantSelectionRequired: true`** مع `tenantSelectionToken`
  (JWT قصير الأجل، **سرّ توقيع منفصل تمامًا** عن أسرار الوصول العادية، حتى
  لا يخلط أي Guard مستقبلي بينهما) و`availableCompanies`.
- `tenantSelectionToken` لا يصلح لأي شيء آخر غير استدعاء `/auth/select-tenant`
  مرة واحدة (منتهي الصلاحية سريعًا، ويحمل `purpose: "tenant_selection"` يُتحقق
  منه صراحة).

## تبديل المنشأة أثناء الجلسة (Tenant Switching)

`POST /auth/switch-tenant` (Body: `{ companyId }`, يتطلب مصادقة حالية):
يُصدر tokens جديدة تمامًا لمنشأة أخرى يملك المستخدم عضوية نشطة فيها، بعد نفس
فحص الـMembership المستخدم في `select-tenant`. هذا هو الأساس الذي سيُبنى عليه
**Tenant/Company Switcher** في الواجهة لاحقًا (`GET /auth/tenants` يُرجع قائمة
المنشآت القابلة للتبديل إليها).

## MembershipGuard — الحماية المستمرة أثناء الجلسة

`Membership.status` قد يتغيّر إلى `suspended` أثناء أن يكون access token
المستخدم ما زال صالحًا فنيًا (15 دقيقة). `MembershipGuard` (يعمل بعد
`JwtAuthGuard` وقبل `PermissionsGuard`، على **كل** طلب مُصادَق عليه — حتى
الذي لا يتطلب صلاحية معيّنة) يتحقق من أن الـMembership المرتبطة بالـtoken ما
زالت `active`، ويرفض الطلب فورًا إن لم تكن كذلك.

## تأثير هذا النموذج على `IamService.createUser`

عند إضافة مستخدم من شاشة "المستخدمين" داخل منشأة:
- إذا كان البريد/الجوال **جديدًا تمامًا** → يُنشأ `User` جديد + `Membership`
  + كلمة مرور مطلوبة.
- إذا كان البريد/الجوال **يطابق مستخدمًا موجودًا بالفعل** (شخص لديه حساب في
  منشأة أخرى) → **لا يُنشأ مستخدم جديد ولا تُغيَّر كلمة مروره أو اسمه** —
  فقط تُضاف `Membership` جديدة تربطه بهذه المنشأة. محاولة تمرير كلمة مرور في
  هذه الحالة تُتجاهل تمامًا (اختُبر صراحة في `test/app.e2e-spec.ts`).
- محاولة إضافة نفس الشخص لنفس المنشأة مرتين → `409 Conflict`.

## المرحلة 2 — الكتالوج والمخزون والأطراف (منفَّذ)

هذا القسم يوثّق الكيانات الجديدة المضافة في المرحلة 2. كلها Tenant-scoped
بالكامل (`companyId` + RLS)، بلا استثناء.

### الكتالوج (Catalog)

```text
ProductCategory (شجرة عبر self-relation parent/children)
Brand
Unit
Product ──belongs to──> ProductCategory? / Brand? / Unit
   └── ProductBarcode[] (0..n باركود لكل منتج)
```

- `Product.sku` فريد **لكل منشأة** وليس عالميًا (`@@unique([companyId, sku])`).
- `ProductBarcode.barcode` فريد **لكل منشأة** كذلك — نفس الباركود الفعلي
  (GTIN) قد يتكرر بمنتجات مختلفة لمنشآت مختلفة (لا تعارض، كل منشأة تدير
  كتالوجها المستقل).
- `costPrice`/`sellingPrice`: `Decimal`، وليس `Float` — أي استخدام لـ`Float`
  في بيانات مالية أو كميات يُعتبر خطأ في هذا المشروع.
- **سلامة المرجع عبر المنشآت (cross-tenant reference integrity)**: FK عادي
  في Postgres لا يستطيع التعبير عن "نفس الصف **و** نفس المنشأة" — لذلك
  `ProductsService`/`CatalogService` يتحققان صراحة في طبقة التطبيق
  (`assertReferencesOwnedByTenant`) أن `categoryId`/`brandId`/`unitId`
  المُرسَلة تعود لنفس `companyId` الحالي قبل أي ربط، وإلا `404/400`. هذا
  مُختبَر صراحة (`test/phase2.e2e-spec.ts`).

### المخزون (Inventory)

```text
Warehouse (من المرحلة 1) ──has──> StockLevel (لكل Product)
                          ──has──> StockMovement[] (سجل تاريخي غير قابل للتعديل)
                                       └── StockAdjustment? (1:1 اختياري، لحركات من نوع adjustment)
                          ──has──> StockCount[] ──has──> StockCountLine[] (لكل Product)
```

- `StockLevel` هو **رصيد محسوب/مُخزَّن** لكل `(warehouseId, productId)` —
  فريد بهذا الزوج. لا "مصدر حقيقة" آخر للرصيد الحالي؛ كل تعديل عليه يمر عبر
  `InventoryService.recordMovement()` فقط (لا تعديل مباشر لـ`quantityOnHand`
  من أي مكان آخر في الكود). **Milestone 6**: يحمل الآن أيضًا `averageCost`
  (متوسط تكلفة مرجّح متحرك)، يُكتَب ضمن نفس الاستعلام الذرّي — لا كتابة
  منفصلة، لا فجوة قراءة-ثم-كتابة. راجع `docs/ACCOUNTING.md` "COGS / تقييم
  المخزون" للصيغة الكاملة ومصادر التكلفة لكل نوع حركة.
- `StockMovement` هو **سجل الحقيقة التاريخي**: كل تغيير في المخزون — رصيد
  افتتاحي، تسوية، تحويل بين مستودعين، مبيعات/مشتريات مستقبلًا — ينتج صف
  `StockMovement` واحد على الأقل بكمية موقّعة (`quantity` موجبة أو سالبة).
  هذا يجعل إعادة احتساب أي رصيد تاريخي أو تدقيقه ممكنًا لاحقًا دون الاعتماد
  فقط على `StockLevel` الحالي.
- **التحويل بين المستودعين (Transfer)**: يُنفَّذ حاليًا كخطوة واحدة ذرّية
  (حركتان — `transfer_out` من المصدر و`transfer_in` للوجهة — تتشاركان
  `referenceId` واحد، داخل نفس الـtransaction). **التحويل متعدد المراحل
  (Multi-stage transfer: طلب → شحن → استلام مع حالة "بالطريق")** مؤجَّل
  عمدًا لمرحلة لاحقة — التصميم الحالي يفترض تحويلًا فوريًا مؤكَّدًا فقط.
- استراتيجية التزامن الكاملة (منع الكميات السالبة والتحديثات المفقودة تحت
  تزامن حقيقي) موثَّقة في `DATABASE.md` §2 و`SECURITY.md`.
- **Stock Count**: `draft` → تعديل السطور بحرية → `completed` (يُنشئ حركة
  `adjustment` تلقائيًا لكل سطر فيه فرق فعلي، ثم يُجمَّد الجرد) أو `cancelled`.
  لا تعديل على سطور جرد `completed`/`cancelled`.

### الأطراف (Parties)

```text
Customer (companyId + reference فريد لكل منشأة إن وُجد)
Supplier (نفس البنية، كيان منفصل تمامًا)
```

- `Customer`/`Supplier` كيانان منفصلان عمدًا في الكود (لا تجريد مشترك) رغم
  تشابه الحقول الحالي — لأنهما سيتباعدان في مرحلة الذمم المدينة/الدائنة
  (Receivables/Payables) لاحقًا، وفرضهما في تجريد واحد الآن يُعقّد ذلك التوسّع
  دون فائدة حالية.
- `phone` **ليس فريدًا** (عائلة واحدة، عميل عابر بلا جوال مسجَّل)؛ `reference`
  (رمز/كود العميل أو المورد) هو المعرّف الفريد الاختياري لكل منشأة إن أراد
  التاجر استخدام ترقيم داخلي.
- لا حقول ائتمان/رصيد/حد ائتماني بعد — هذه تنتمي لمرحلة الحسابات
  (Accounting phase)، وإضافتها الآن كحقول فارغة "تحسبًا للمستقبل" كانت
  ستُخالف قاعدة "لا تُفرط في البناء".
- لا حقول Qeedha-specific مُخترَعة (لا `qeedhaCustomerId` ولا ما شابه) —
  التوافق المستقبلي مع qeedha سيمر عبر Integration Layer، وليس عبر حقول في
  هذين الجدولين.

## نطاق الفروع/المستودعات (Branch & Warehouse Authorization Scope) — مُفعَّل من المرحلة 2.1

> **تحديث المرحلة 2.1**: هذا القسم كان يوثّق فجوة معروفة صراحة في المرحلة 2
> ("لا فحص فرع/مستودع في أي Guard أو Service"). تلك الفجوة أُغلقت الآن لوحدة
> `inventory` تحديدًا. يبقى المبدأ نفسه: لا نظام تفويض "مزيّف" — كل ما هو
> مُطبَّق موثَّق هنا بدقة، وكل ما لم يُطبَّق بعد موثَّق بنفس الصراحة أدناه.

### النموذج

`MembershipRole.branchId` (موجود في المخطط منذ إعادة هيكلة Auth/IAM، اختياري
لكل إسناد دور) هو مصدر الحقيقة الوحيد لنطاق الفرع — لا جدول جديد، لا نظام
موازٍ. القاعدة:

- `branchId = null` على إسناد دور ⇐ هذا الإسناد يمنح الصلاحيات التي يحملها
  **في كل فروع المنشأة** (هذا سلوك التسجيل الافتراضي: `Owner` عند تسجيل
  منشأة جديدة يُسنَد بـ`branchId: null`، أي نطاق كامل من اليوم الأول).
- `branchId = <فرع محدد>` ⇐ هذا الإسناد يمنح الصلاحيات التي يحملها **فقط في
  ذلك الفرع وكل مستودعاته** — وليس مستودعًا واحدًا بعينه، بل الفرع كاملًا.
- عضوية واحدة قد تحمل أكثر من إسناد دور (نفس الدور أو أدوار مختلفة، بفروع
  مختلفة) — النطاق الفعلي لصلاحية معيّنة هو **اتحاد (union)** كل الفروع من
  كل إسناد يمنح تلك الصلاحية؛ إن كان أي إسناد منها `branchId: null`، يصبح
  النطاق الكامل تلقائيًا (لا يمكن "تقييد" نطاق كامل بإضافة فرع محدد).

### أين يُفرض هذا فعليًا

- `IamService`/`BranchScopeService.getScopeForPermission(tx, membershipId,
  permissionKey)` (وحدة `iam`) يحسب هذا النطاق **لصلاحية محددة**، وليس
  تجميعًا عامًا — نفس العضوية قد يكون نطاقها مختلفًا لصلاحية `inventory.read`
  عن نطاقها لصلاحية `inventory.transfer` إن حملت إسنادات مختلفة.
- **`PermissionsGuard` لم يتغيّر** ولا يزال يجيب فقط "هل تملك هذه العضوية
  هذه الصلاحية في أي مكان بالمنشأة؟" — هذا يبقى بوابة الدخول الأولى (401/403
  عام). فحص الفرع/المستودع يحدث **بعده**، في طبقة الخدمة (`InventoryService`,
  `StockCountService`)، لأنه يحتاج معرفة أي مورد (`warehouseId`) بالتحديد
  طلب المستخدم — وهذا غير متاح بشكل موحّد على مستوى الـGuard قبل تنفيذ
  الـDTO. هذا قرار معماري مسجَّل، وليس إغفالًا: نفس الطبقة التي تفرض أصلًا
  سلامة المراجع عبر المنشآت (`assertWarehouseOwned`) هي التي تفرض الآن نطاق
  الفرع أيضًا، بفحص إضافي على نفس السطر.
- التمييز بين حالتي الرفض: **404** يعني "هذا المستودع لا ينتمي لهذه المنشأة
  إطلاقًا" (سلامة مرجعية عبر المنشآت، كما كان). **403** يعني "هذا المستودع
  ينتمي لمنشأتك فعلًا، لكن نطاق هذه العضوية لهذه الصلاحية لا يشمل فرعه"
  (تفويض فرع، جديد في 2.1). فصل متعمَّد بين الحالتين، وليس صدفة.
- نقاط القراءة (القوائم: `GET /inventory/stock-levels`, `/movements`,
  `/stock-counts`) لا تُرفض بخطأ عند طلب `warehouseId` خارج النطاق — تُصفَّى
  بصمت (نتيجة فارغة، 200)، بنفس اتفاقية عزل المستأجرين المعتمدة في كل قوائم
  هذا النظام. الرفض الصريح (403) مقصور على العمليات على مورد محدد (تسوية،
  تحويل، رصيد افتتاحي، إنشاء/تحديث/اعتماد/إلغاء جرد).

### ما يبقى خارج هذا النطاق (مقصود، وليس نسيانًا)

- **Products/Customers/Suppliers تبقى على مستوى المنشأة بالكامل (tenant-wide)
  ولا تحمل أي قيد فرع** — لا يوجد مبرر عمل حقيقي لتقييدها بفرع في هذه
  المرحلة (نفس منطق `docs/DOMAIN_MODEL.md` "الأطراف" أعلاه)، وإضافة قيد كهذا
  الآن كانت ستُخالف قاعدة "لا تُفرط في البناء".
- **`tenancy.branches.manage` / `tenancy.warehouses.manage`** (إنشاء/تعديل
  الفروع والمستودعات نفسها) لا تزالان بلا فحص نطاق فرع — منطقي، لأن إنشاء
  فرع جديد هو عملية على مستوى المنشأة كاملة أصلًا، لا على فرع قائم.
  `IamService.assignRole`/`createUser` كذلك بلا فحص نطاق فرع على الفرع
  الذي يُسنَد إليه الدور — يكفي أن يكون ذلك الفرع تابعًا لنفس المنشأة (مُتحقَّق
  فعليًا).
- **POS/Sales (المرحلة 3)** ستحتاج نفس نموذج النطاق هذا (`branchId` على
  `PosDevice` موجود من المرحلة 1) — يُعاد استخدام `BranchScopeService` نفسه
  حين تُبنى، لا نظام موازٍ جديد.

## المرحلة 3 — المبيعات والدفع والفواتير (منفَّذ)

راجع `docs/SALES.md`, `docs/PAYMENTS.md`, `docs/INVOICES.md`, `docs/POS.md`
للتفصيل الكامل. ملخص الموضع في نموذج الهوية/التفويض:

- **POS مفهوم واجهة فقط** — لا جدول قاعدة بيانات باسم `pos`. المعاملة
  الفعلية هي `Sale` (+ `SaleItem` + `Payment` + `Invoice`).
- **`Sale.branchId` يُشتق دائمًا من `Warehouse.branchId`**، لا حقل فرع
  يُرسَل من العميل — نفس مبدأ "لا ثقة بمعرّفات من العميل" المُطبَّق على
  `companyId` منذ المرحلة 1 يمتد الآن لفرع المستودع.
- **نطاق الفرع (Branch Scope) من المرحلة 2.1 يُعاد استخدامه حرفيًا** —
  `BranchScopeService` نفسه، بلا تعديل على نموذجه، فقط صلاحيات جديدة
  (`sales.create`, `sales.read`, `sales.cancel`) تُمرَّر له.
- **`PosDevice`** (موجود من المرحلة 1، بلا تعديل على مخططه) أصبح له أول
  استهلاك فعلي: التحقق أنه ينتمي لنفس فرع المستودع المُستخدَم في البيع.
- **Snapshot في `SaleItem`**: نمط جديد في هذا المشروع — أول كيان يحتفظ عمدًا
  بنسخة من بيانات كيان آخر (`Product`) بدل الإشارة الحية فقط، لأن الفاتورة
  سجل تاريخي يجب ألا يتغيّر بتغيّر المنتج لاحقًا. راجع `docs/SALES.md`.
- **Idempotency كمفهوم هوية جديد**: `Sale.clientReferenceId` هو أول حقل في
  المشروع يمثّل "هوية معاملة من طرف العميل" منفصلة عن معرّف قاعدة البيانات —
  أساس ضروري لأي Offline-first لاحقًا (`docs/POS.md`).

## المرحلة 4 — المشتريات والمصروفات وأساس المحاسبة (منفَّذ)

راجع `docs/PURCHASING.md`, `docs/EXPENSES.md`, `docs/CHART_OF_ACCOUNTS.md`,
`docs/JOURNAL_ENTRIES.md`, `docs/ACCOUNTING.md` للتفصيل الكامل. ملخص
الموضع في نموذج الهوية/التفويض:

```text
Supplier (المرحلة 2) ──has──> Purchase ──has──> PurchaseItem[] (Snapshot)
                                  │
                                  └──(عند الاستلام)──> InventoryService.recordMovement
                                                     + JournalService.postJournalEntry

Branch? ──has (اختياري)──> Expense ──belongs to──> ExpenseCategory ──points to──> Account
                                  │
                                  └──(عند الإنشاء/التعديل المالي/الحذف)──> JournalService

Account (شجري عبر self-relation) ──has──> JournalLine[] ──belongs to──> JournalEntry
```

- **`Purchase.branchId` يُشتق دائمًا من `Warehouse.branchId`**، بنفس مبدأ
  `Sale.branchId` من المرحلة 3 حرفيًا — لا حقل فرع يُرسَل من العميل.
- **`Expense.branchId` اختياري صراحة** — أول كيان تجاري في المشروع يسمح
  صراحة بعدم الانتماء لأي فرع (مصروف على مستوى المنشأة). لا فحص نطاق فرع
  يُطبَّق حين يكون فارغًا.
- **نطاق الفرع (`BranchScopeService`) من المرحلة 2.1 يُعاد استخدامه
  حرفيًا** لكل من `Purchase` (عبر فرع المستودع) و`Expense` (عند وجود
  `branchId`) — لا نظام موازٍ جديد، ولا تعديل على نموذج
  `MembershipRole.branchId` نفسه.
- **`JournalEntry.branchId` اختياري كذلك**، ويُنسَخ من فرع المعاملة
  المصدر إن وُجد. قاعدة رؤية خاصة به: قيد بلا فرع مرئي دائمًا لأي عضو
  يملك `accounting.read`، بصرف النظر عن نطاق فروعه — راجع
  `docs/JOURNAL_ENTRIES.md` "`branchId` الاختياري وقاعدة الرؤية".
- **Idempotency يمتد لكيانين جديدين**: `Purchase.clientReferenceId` و
  `Expense.clientReferenceId`، بنفس نمط `Sale.clientReferenceId` حرفيًا
  (مسار سريع + قيد تفرّد كخط دفاع ثانٍ ضد سباق تزامن حقيقي).
- **لا صلاحية RBAC جديدة لخطوة فرعية من تدفق موجود**: استلام الشراء لا
  يملك صلاحية `purchases.receive` منفصلة — يشترك مع `purchases.create`
  عمدًا، اتساقًا مع اتفاقية "صلاحية واحدة لكل نوع عملية كتابة رئيسية" في
  هذا النظام.
- **لا Endpoint لإنشاء/تعديل/حذف `JournalEntry` مباشرة** — أول قسم من
  النظام يفرض عمدًا "قراءة فقط" على كيان كامل عبر تصميم الـController نفسه
  (لا مجرد صلاحية مفقودة)، لأن `JournalEntry` يجب ألا يُنشَأ إلا كأثر
  جانبي محسوب لعملية تجارية حقيقية. راجع `docs/JOURNAL_ENTRIES.md`.
- **`Account.code` كمفتاح بحث ثابت لكل منشأة، وليس UUID**: أول مكان في
  النظام يُحلّ فيه مرجع كيان عبر حقل نصي مستقر (`code`) بدل معرّف قاعدة
  بيانات — لأن المُستدعي (`SalesService`/`PurchasesService`/
  `ExpensesService`) يحتاج معرفة "حساب النقدية لهذه المنشأة" دون معرفة
  UUID محدد سلفًا. راجع `docs/CHART_OF_ACCOUNTS.md` "Account Mapping".

## Milestone 1 — Accounting Completion (بعد المرحلة 4 مباشرة، منفَّذ)

راجع `docs/ACCOUNTING.md` "Milestone 1: Accounting Completion" للتفصيل
الكامل. كيانان جديدان يمسّان نموذج الهوية/التفويض:

```text
FiscalPeriod (company_id-scoped، RLS) — start_date/end_date/status
  ──يُستشار من──> JournalService.postJournalEntry/reverseJournalEntry
                  (assertTodayNotLocked قبل أي ترحيل/عكس جديد)

OpeningBalance — ليس كيانًا/جدولًا منفصلًا، بل JournalEntry عادي
  (referenceType='OpeningBalance', referenceId=companyId) — لا نموذج
  بيانات جديد، فقط استخدام آخر لنقطة العبور الوحيدة الموجودة أصلًا.
```

- **`FiscalPeriod` كيان جديد على مستوى المنشأة (بلا `branchId`)** —
  نطاق الفروع (`BranchScopeService`) لا يمتد إليه؛ الفترات المحاسبية
  وإقفالها قرار على مستوى المنشأة كاملة، وليس لكل فرع على حدة.
  `closed_by_membership_id` يشير إلى `Membership` (وليس `User` مباشرة)
  اتساقًا مع مبدأ الملف نفسه: كل إسناد/فعل حساس يُنسَب لعضوية محدَّدة
  ضمن منشأة، لا لهوية عالمية مجردة.
- **الأرصدة الافتتاحية المحاسبية ليست كيانًا جديدًا في نموذج البيانات
  على الإطلاق** — عمدًا: بدل جدول `opening_balances` منفصل (كما افترض
  التصميم المرجعي الأصلي، راجع `docs/DATABASE.md` §7 "انحراف موثَّق")،
  هي `JournalEntry` عادي يمر عبر نفس القيود والتحقق (توازن مدين=دائن،
  نطاق الفرع، الفترة المحاسبية غير المُقفلة) التي يمر بها أي قيد آخر —
  لا نموذج تفويض موازٍ يحتاج توثيقًا منفصلًا هنا.
- **مهم: هذا مفهوم مختلف تمامًا عن "الرصيد الافتتاحي" لكيان `StockLevel`
  من المرحلة 2** (`InventoryService.setOpeningBalance`،
  `StockMovementType.opening_balance`) — تشابه الاسم فقط، لا علاقة بين
  الاثنين في نموذج البيانات أو التفويض.

## نقاط توسّع مستقبلية جاهزة بهذا التصميم

- **Tenant/Company switcher في الواجهة**: `GET /auth/tenants` +
  `POST /auth/switch-tenant` جاهزان الآن.
- **صلاحيات مختلفة لكل منشأة**: مضمونة بنيويًا لأن `MembershipRole` مرتبط
  بـ`Membership` لا بـ`User`.
- **فروع مختلفة لكل منشأة بصلاحيات مختلفة**: `MembershipRole.branchId`
  موجود من الآن.
- **دعوة مستخدم موجود لمنشأة جديدة (Invite)**: `IamService.createUser` يغطي
  هذا الآن جزئيًا (بدون بريد دعوة فعلي بعد — التاجر يُدخل بيانات الشخص
  مباشرة). إرسال بريد/رابط دعوة حقيقي يبقى تحسينًا مستقبليًا موثَّقًا هنا،
  وليس افتراضًا خفيًا.

## Milestone 2 (Production Hardening + Demo/Staging Readiness)

**لا تغييرات على نموذج الهوية/المنشآت في هذا الـMilestone.** التغيير
الوحيد ذو الصلة بهذا الملف هو تشغيلي بحت: `IamService.listUsers`
(`GET /iam/users`) أصبح مُرقَّمًا (`{data, meta}`) بدل مصفوفة مسطّحة غير
محدودة — لا تغيير على `Membership`/`Role`/`Permission` نفسها، راجع
`docs/API.md` و`docs/PROJECT_STATUS.md` قسم Milestone 2.

## Milestone 3 (Excel Import)

**لا تغيير على نموذج الهوية/المنشآت نفسه.** جدول جديد واحد فقط
(`ImportJob`، tenant-scoped بنفس نمط RLS المعتاد) يُضاف كيان أعمال جديد
بحت — `Company` → `ImportJob` مباشرة (`companyId`)، بالإضافة لمرجعَين
لهوية المنفِّذ (`actorMembershipId`/`actorUserId`) بنفس نمط كل كيان أعمال
آخر في هذا النظام (`Sale.actorMembershipId`، إلخ) — **وليس نموذج هوية
جديدًا موازيًا**. صلاحيتان جديدتان فقط في جدول `Permission` الموجود أصلًا
(`import.read`/`import.create`)، لا تغيير على `Role`/`RolePermission`/
`MembershipRole` نفسها. راجع `docs/IMPORT_EXCEL.md` للتصميم الكامل،
`docs/DATABASE.md` §8 للجدول، و`docs/SECURITY.md` "استيراد من Excel"
للاعتبارات الأمنية.

## Milestone 4 (ZATCA E-Invoicing Readiness — Phase 1 فقط)

**لا تغيير على نموذج الهوية/المنشآت نفسه.** جدول جديد واحد فقط
(`InvoiceCompliance`، tenant-scoped، علاقة 1:1 مع `Invoice` عبر
`invoiceId` الفريد) — كيان "هل تعرف ZATCA بهذه الفاتورة، وكيف"، منفصل
تمامًا عن `Invoice` نفسه (الذي يبقى سجل الأعمال الداخلي بلا أي تلوّث
بتفاصيل امتثال خارجي). لا صلاحيات RBAC جديدة (لا Endpoint مخصص - رمز
QR يظهر ضمن استجابة `GET /invoices` الموجودة أصلًا، محكومًا بنفس صلاحية
`invoices.read`). راجع `docs/ZATCA.md` للتصميم الكامل و"ما لم يُنفَّذ،
ولماذا"، و`docs/DATABASE.md` §9 للجدول.

## Milestone 6 (Weighted-Average Inventory Valuation & COGS)

**لا تغيير على نموذج الهوية/المنشآت، ولا كيان جديد.** فقط عمودان جديدان
على كيانين موجودين — `StockLevel.averageCost` (متوسط التكلفة المرجَّح
المتحرك، محفوظ على مستوى (مستودع, منتج)، لا على مستوى منشأة) و
`SaleItem.unitCost` (تكلفة الوحدة الفعلية وقت البيع، تُستخدَم لاحقًا
لعكس COGS بدقة عند الإلغاء/الإرجاع بدل استخدام المتوسط الحالي المتغيّر).
راجع `docs/ACCOUNTING.md` "COGS / Inventory Valuation" للتصميم الكامل،
و`docs/DATABASE.md` الملاحظات ضمن الأقسام 2/4.

## Milestone 7 (Merchant Operations & Business Completion)

**لا تغيير على نموذج الهوية/المنشآت نفسه.** ستة كيانات أعمال جديدة، كلها
tenant-scoped بنفس نمط RLS المعتاد، وكلها تُشير لكيان أعمال قائم بدل
اختراع مفهوم موازٍ:

- **`SupplierPayment`**: `Company` → `Purchase` (`purchaseId` **إلزامي**،
  على عكس `Payment.saleId` الذي بقي كما هو) — دفعة تسدد فاتورة شراء
  محددة دائمًا، مرآة لـ`Payment` الموجود، لا كيان AP منفصل مخزَّن.
- **`SaleReturn` / `SaleReturnItem`**: `Sale` → `SaleReturn` →
  `SaleReturnItem` → `SaleItem` (السطر الأصلي المُرجَع منه) — كيان معاملة
  تصحيحية داخلية، يُعرَّف بـUUID فقط (كـ`StockAdjustment`/`StockTransfer`،
  لا رقم تسلسلي كـ`Invoice`/`Purchase`)، **منفصل تمامًا عن `Sale.status`**
  (الذي لا يزال يعبّر فقط عن إلغاء كامل عبر `cancelSale`، دون علاقة
  بمرتجع جزئي).
- **`PurchaseReturn` / `PurchaseReturnItem`**: نفس بنية `SaleReturn` تمامًا،
  لكن تجاه `Purchase`/`PurchaseItem` — ولا تلمس `Purchase` الأصلي بأي حال
  (لا تعديل، لا حالة جديدة).
- **`BankReconciliation`**: `Company` → `BankReconciliation` (`accountCode`
  رمز ثابت من دليل الحسابات، لا FK لصف `Account`) — كيان مستقل بلا علاقة
  بأي كيان أعمال آخر، يقرأ من `JournalLine` وقت الإنشاء فقط ولا يُعاد
  حسابه لاحقًا.

`Payment` (الموجود منذ Phase 3) اكتسب عمود `clientReferenceId` اختياري
جديد — **لا كيان جديد**، فقط توسعة صغيرة لإعطاء "تسجيل دفعة على بيع
موجود" (بخلاف الدفعات المُنشأة وقت البيع نفسه) idempotency حقيقية.

خمس صلاحيات RBAC جديدة فقط (`sales.payment.record`, `sales.return`,
`purchases.payment.record`, `purchases.return`,
`accounting.reconciliation.manage`) في جدول `Permission` الموجود أصلًا —
لا تغيير على `Role`/`RolePermission`/`MembershipRole` نفسها كبنية. راجع
`docs/ACCOUNTING.md` "Milestone 7" للتصميم المحاسبي الكامل،
`docs/DATABASE.md` الأقسام 4/5/7 للجداول، و`docs/SECURITY.md` للاعتبارات
الأمنية/التزامن.

## Milestone 8 (SaaS / Subscription & Billing)

يضيف طبقة SaaS جديدة فوق نموذج الهوية/المنشآت **دون تغيير أي من كياناته
الخمسة الأصلية**. كيانان جديدان فقط:

- **`Plan`**: كتالوج عام، **ليس** tenant-scoped (بلا `company_id`، بلا
  RLS) — نفس معاملة `Permission`/`IntegrationProvider` الموجودتين سلفًا:
  كل منشأة تقرأ نفس كتالوج الخطط. `features` (JSON) هو المصدر المركزي
  الوحيد لصلاحيات الميزات؛ `maxUsers`/`maxBranches`/`maxMonthlySales`
  حدود الاستخدام (`null` = بلا حد).
- **`Subscription`**: tenant-scoped (`company_id` **فريد** — سطر واحد
  بالضبط لكل `Company`)، RLS FORCE + `tenant_isolation` كاملة كأي كيان
  أعمال آخر منذ Phase 1. `Company.subscription` علاقة عكسية جديدة فقط.

### لماذا لا Backfill في الـmigration (قرار تصميم، ليس قصورًا)

`Subscription` يحمل `FORCE ROW LEVEL SECURITY`، والدور الذي تعمل به
`prisma migrate deploy`/`prisma db seed` في هذا المشروع (`qeedha_dev`)
**ليس Superuser ولا BYPASSRLS** (نفس الدور الذي يخدم التطبيق وقت
التشغيل — تعمّدًا، fليس دورًا امتيازيًا منفصلًا لأدوات الهجرة). أي
`INSERT ... SELECT FROM companies` عابر لكل المستأجرين داخل الـmigration
كان سيُمنَع صامتًا بواسطة RLS نفسه (لا `app.tenant_id` مضبوطًا =
`current_setting(...)` يُرجِع `NULL` = كل صف يُرفَض). الحل: أي منشأة بلا
سطر اشتراك (سابقة لهذا الـMilestone، أو أي فجوة أخرى) تحصل عليه بشكل
كسول عند أول طلب مصادَق — `SubscriptionService.loadContext` يُنشئ
الاشتراك ضمن معاملة tenant-scoped صحيحة (نفس `tx` التي يستخدمها الطلب
نفسه)، فلا حاجة لأي بايباس RLS على الإطلاق. نفس الآلية بالضبط تُستخدَم
لاكتشاف انتهاء الفترة التجريبية (`trialing` → `expired`) بلا أي
Background Job — لا بنية جدولة (cron/queue) موجودة في هذا المشروع، فبدل
اختراعها، يُكتشَف الانتقال ويُحفَظ بشكل كسول في أول طلب بعد الانتهاء
الفعلي، مع تسجيل Audit فوري.

### طبقتا تفويض منفصلتان تمامًا (لا استبدال)

RBAC (`Role`/`Permission`/`MembershipRole`, موجود منذ Phase 1) يُجيب
"هل يملك هذا المستخدم صلاحية القيام بهذا الإجراء في هذه المنشأة؟".
الاشتراك (`Plan.features`) يُجيب سؤالًا مختلفًا تمامًا: "هل تشمل خطة
هذه المنشأة هذه الميزة أصلًا؟". السلسلة الكاملة لكل طلب:
`JwtAuthGuard` (مُصادَق) → `MembershipGuard` (عضوية نشطة) →
`PermissionsGuard` (RBAC) → `SubscriptionGuard` (منشأة موقوفة؟ اشتراك
مقيَّد + طلب مُغيِّر؟ ميزة `@RequireFeature` مشمولة بالخطة؟) — مالك
يملك كل صلاحيات RBAC (`Role: Owner`) لا يزال يُمنَع من ميزة غير مشمولة
بخطة منشأته، ومستخدم بصلاحية RBAC صحيحة على خطة كاملة الميزات لا يزال
يُمنَع إن كانت منشأته موقوفة/منتهية الاشتراك.

### دمج دورة حياة المنشأة — اكتشاف مهم

`Company.status` (`CompanyStatus: active | suspended`) موجود في الـ
schema منذ Phase 1 لكنه **لم يكن مُفعَّلًا في أي Guard/Service/Controller
قبل هذا الـMilestone** — حقل صامت تمامًا. `SubscriptionGuard` هو أول
مكان يقرأه فعليًا: منشأة موقوفة (`suspended`) تمنع كل الطلبات ما عدا
مسارات `@SubscriptionExempt()` الصغيرة (`/auth/me`, `/auth/logout`,
`/auth/refresh`, `/auth/tenants`, `/auth/switch-tenant`,
`/subscriptions/me`, `/subscriptions/plans`) — أشد تقييد من اشتراك
مقيَّد (الذي يمنع الطلبات المُغيِّرة فقط). لم يُستبدَل `CompanyStatus`
ولم يُدمَج مع `SubscriptionStatus` في enum واحد — يبقيان مفهومين
منفصلين عمدًا: الأول تشغيلي/إداري (يُحدَّد لاحقًا عبر مركز تحكم مستقبلي
لأسباب لا علاقة لها بالفوترة، مثل إساءة استخدام)، والثاني تجاري
(اشتراك/فوترة). "لا تناقض" مطلوب وليس "دمج" — منشأة يمكن أن تكون
`active` + اشتراكها `expired` معًا، وهذا سلوك صحيح ومقصود.

راجع `docs/DATABASE.md` "Milestone 8" للجداول والفهارس،
`docs/SECURITY.md` "Milestone 8" لتفصيل `SubscriptionGuard`/RLS/التزامن،
و`docs/API.md` "Milestone 8" لعقد `/subscriptions/*`.
