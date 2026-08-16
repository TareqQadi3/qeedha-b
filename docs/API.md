# بنية الـ API

## معايير عامة

- REST، إصدار في المسار: `/api/v1/...`
- JSON فقط، `Content-Type: application/json`.
- المصادقة: `Authorization: Bearer <access_token>`.
- كل استجابة خطأ بصيغة موحّدة:
  ```json
  { "error": { "code": "STRING_CODE", "message": "...", "details": null } }
  ```
- Pagination موحّدة: `?page=1&pageSize=20` مع استجابة
  `{ "data": [...], "meta": { "page", "pageSize", "total" } }`.
- كل Endpoint يعلن الصلاحية المطلوبة صراحة عبر `@RequirePermissions()` — لا
  اعتماد ضمني على اسم المسار.
- `company_id`/`branch_id` تُشتق من الـJWT وسياق الطلب، لا تُقبل من Body/Query
  لتحديد نطاق الوصول (تُستخدم فقط لتحديد كيان مستهدف ضمن نطاق المستخدم نفسه).
  حتى Endpoints تبديل المنشأة التي تستقبل `companyId` بالطلب تتحقق من
  Membership فعلية قبل أي تصرف — راجع `SECURITY.md` وDOMAIN_MODEL.md`.
- **CORS (Milestone 2)**: الـAPI لا يقبل طلبات متصفح من أي origin —
  `CORS_ALLOWED_ORIGINS` (متغيّر بيئة، قائمة origins مفصولة بفواصل) إلزامي
  في production (رفض إقلاع صريح بدونه)، واختياري في development/test
  (افتراضي: منافذ Vite المحلية). راجع `docs/SECURITY.md` "CORS" و
  `backend/.env.example`.

## Endpoints المرحلة الأولى

### Auth (`/api/v1/auth`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| POST | `/register-company` | تسجيل منشأة جديدة + مستخدم Owner أول + Membership | عام (Rate-limited) |
| POST | `/login` | تسجيل دخول (email/mobile + password) — انظر ملاحظة أدناه | عام (Rate-limited) |
| POST | `/select-tenant` | إتمام الدخول لمستخدم بعدة عضويات (tenantSelectionToken + companyId) | عام، يتطلب tenantSelectionToken صالح |
| POST | `/refresh` | تجديد access token عبر refresh token (لنفس الـtenant) | يتطلب refresh token صالح |
| POST | `/logout` | إبطال refresh token الحالي | يتطلب مصادقة |
| GET | `/me` | بيانات المستخدم الحالي + الـMembership الفعّالة + صلاحياتها | يتطلب مصادقة |
| GET | `/tenants` | المنشآت التي يملك المستخدم عضوية نشطة فيها (أساس Tenant Switcher) | يتطلب مصادقة |
| POST | `/switch-tenant` | تبديل الجلسة الحالية إلى منشأة أخرى يملك المستخدم عضوية فيها | يتطلب مصادقة |

**ملاحظة على `/login`**: الاستجابة تختلف حسب عدد عضويات المستخدم النشطة —
عضوية واحدة تُعيد `{ accessToken, refreshToken, activeTenant, user }` مباشرة؛
عضويتان فأكثر تُعيد `{ tenantSelectionRequired: true, tenantSelectionToken,
availableCompanies }` بدل tokens حقيقية، إلى أن يُستدعى `/select-tenant`.
التفاصيل الكاملة في `DOMAIN_MODEL.md` قسم "تسجيل الدخول واختيار المنشأة".

### IAM (`/api/v1/iam`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/roles` | قائمة الأدوار المتاحة للمنشأة | `iam.roles.view` |
| GET | `/permissions` | قائمة الصلاحيات المتاحة في النظام | `iam.roles.view` |
| GET | `/users` | أعضاء المنشأة (Memberships) وأدوارهم ضمنها — مُرقَّم (`?page&pageSize`)، صيغة `{data, meta}` القياسية أعلاه منذ Milestone 2 (كانت مصفوفة مسطّحة غير محدودة قبلها) | `iam.users.view` |
| POST | `/users` | إضافة عضوية جديدة — تُنشئ مستخدمًا جديدًا، أو تُرفق مستخدمًا موجودًا بالفعل (بدون لمس كلمة مروره) إن تطابق البريد/الجوال | `iam.users.manage` |
| POST | `/users/:id/roles` | إسناد دور لمستخدم ضمن هذه المنشأة (مع نطاق فرع اختياري) | `iam.users.manage` |
| DELETE | `/users/:id/roles/:membershipRoleId` | إلغاء إسناد دور | `iam.users.manage` |

### Tenancy (`/api/v1/tenancy`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET/POST | `/branches` | الفروع | `tenancy.branches.view` / `manage` |
| GET/POST | `/warehouses` | المستودعات | `tenancy.warehouses.view` / `manage` |
| GET/POST | `/pos-devices` | أجهزة نقاط البيع | `tenancy.pos_devices.view` / `manage` |

### Integrations (`/api/v1/integrations`) — بنية عامة فقط، بدون منطق قيّدها
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/providers` | التكاملات المتاحة (metadata) | `settings.integrations.view` |
| GET | `/connections` | تكاملات المنشأة الحالية وحالاتها | `settings.integrations.view` |
| POST | `/connections/:providerKey/connect` | بدء ربط تكامل | `settings.integrations.manage` |
| POST | `/connections/:providerKey/disconnect` | فصل تكامل | `settings.integrations.manage` |
| POST | `/webhooks/:providerKey` | استقبال Webhook عام (توقيع يُتحقق منه لكل provider) | عام (موقّع) |

### Health
| Method | Path | الوصف |
|---|---|---|
| GET | `/api/v1/health` | فحص حالة الخدمة وقاعدة البيانات |

**Milestone 2**: عند النجاح (`200`) يُرجع
`{ status: "ok", timestamp, checks: { app: "ok", database: "ok" } }`.
عند فشل فحص قاعدة البيانات يُرجع **`503`** (لا `200`) عبر
`ServiceUnavailableException`، بحيث أي فحص صحة على مستوى الحاوية/
المنسّق (orchestrator) يعتمد فقط على HTTP status code يعمل بشكل صحيح —
راجع `HttpExceptionFilter`: جسم الخطأ يتّبع صيغة `{error:{...}}`
الموحّدة أعلاه، وأسماء الفحوص الفاشلة تُدمَج داخل `message` بدل حقل
`checks` منفصل في حالة الفشل. لا يُسرَّب أي connection string أو تفصيل
داخلي آخر.

## Endpoints المرحلة الثانية

### Catalog (`/api/v1/catalog`, `/api/v1/products`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET/POST | `/catalog/units` | وحدات القياس | `products.read` / `products.create` |
| PATCH/DELETE | `/catalog/units/:id` | تعديل/حذف وحدة | `products.update` / `products.delete` |
| GET/POST | `/catalog/brands` | العلامات التجارية | `products.read` / `products.create` |
| PATCH/DELETE | `/catalog/brands/:id` | تعديل/حذف علامة | `products.update` / `products.delete` |
| GET/POST | `/catalog/categories` | التصنيفات (شجرية) | `products.read` / `products.create` |
| PATCH/DELETE | `/catalog/categories/:id` | تعديل/حذف تصنيف | `products.update` / `products.delete` |
| GET | `/products` | قائمة المنتجات (بحث/صفحات/فلاتر تصنيف-علامة-نشاط) | `products.read` |
| POST | `/products` | إنشاء منتج (+ باركود مبدئي اختياري) | `products.create` |
| GET/PATCH/DELETE | `/products/:id` | عرض/تعديل/حذف ناعم لمنتج | `products.read` / `update` / `delete` |
| POST | `/products/:id/barcodes` | إضافة باركود لمنتج | `products.update` |
| DELETE | `/products/:id/barcodes/:barcodeId` | إزالة باركود | `products.update` |

### Inventory (`/api/v1/inventory`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/inventory/stock-levels` | أرصدة المخزون حسب المستودع (فلتر `lowStockOnly`) | `inventory.read` |
| GET | `/inventory/movements` | سجل حركات المخزون (فلاتر منتج/مستودع/نوع) | `inventory.read` |
| POST | `/inventory/opening-balance` | تسجيل رصيد افتتاحي لمنتج في مستودع | `inventory.adjust` |
| POST | `/inventory/adjustments` | تسوية مخزون (زيادة/نقصان يدوي) | `inventory.adjust` |
| POST | `/inventory/transfers` | تحويل بين مستودعين (فوري، ذرّي) | `inventory.transfer` |
| GET/POST | `/inventory/stock-counts` | قوائم/إنشاء جرد مخزون | `inventory.count` |
| GET | `/inventory/stock-counts/:id` | تفاصيل جرد وسطوره | `inventory.count` |
| PATCH | `/inventory/stock-counts/:id/lines` | تحديث الكميات الفعلية المعدودة (طالما الجرد `draft`) | `inventory.count` |
| POST | `/inventory/stock-counts/:id/complete` | اعتماد الجرد (يُنشئ حركات تسوية تلقائيًا للفروقات) | `inventory.count` |
| POST | `/inventory/stock-counts/:id/cancel` | إلغاء جرد | `inventory.count` |

### Parties (`/api/v1/customers`, `/api/v1/suppliers`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET/POST | `/customers` | قائمة/إنشاء عميل (بحث اسم/جوال/مرجع) | `customers.read` / `customers.create` |
| GET/PATCH/DELETE | `/customers/:id` | عرض/تعديل/حذف ناعم لعميل | `customers.read` / `update` / `delete` |
| GET/POST | `/suppliers` | قائمة/إنشاء مورد | `suppliers.read` / `suppliers.create` |
| GET/PATCH/DELETE | `/suppliers/:id` | عرض/تعديل/حذف ناعم لمورد | `suppliers.read` / `update` / `delete` |

جميع endpoints المرحلة الثانية تخضع لنفس سلسلة الحراسة
(`JwtAuthGuard → MembershipGuard → PermissionsGuard`) ولنفس قاعدة اشتقاق
`companyId` من الـJWT فقط — لا فرق معماري عن endpoints المرحلة الأولى.
مراجع عبر-كيانات (`categoryId`, `brandId`, `unitId`, `warehouseId`) تُتحقق
دائمًا من ملكيتها لنفس المنشأة في طبقة الخدمة قبل أي كتابة (راجع
`SECURITY.md`).

## Endpoints المرحلة الثالثة

### Sales (`/api/v1/sales`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/sales` | قائمة المبيعات (مُصفّاة حسب نطاق الفرع، فلاتر عميل/مستودع/حالة) | `sales.read` |
| GET | `/sales/:id` | تفاصيل بيع (بنود، دفعات، فاتورة) | `sales.read` |
| POST | `/sales` | إتمام بيع كامل (بنود + دفع + خصم مخزون + فاتورة، ذرّي) — يتطلب `clientReferenceId` لحماية التكرار | `sales.create` |
| POST | `/sales/:id/cancel` | إلغاء بيع مكتمل (يُرجع المخزون، يُلغي الفاتورة) | `sales.cancel` |

### Invoices (`/api/v1/invoices`) — قراءة فقط
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/invoices` | قائمة الفواتير (مُصفّاة حسب نطاق الفرع، فلاتر عميل/حالة) | `invoices.read` |
| GET | `/invoices/:id` | تفاصيل فاتورة | `invoices.read` |

لا `POST /invoices` — الفاتورة تُصدَر فقط داخل `POST /sales` (راجع
`docs/INVOICES.md`). كل endpoints المرحلة الثالثة تخضع لنفس سلسلة الحراسة
ونفس قاعدة اشتقاق `companyId` من الـJWT، بالإضافة لطبقة نطاق الفرع من
المرحلة 2.1 (`BranchScopeService`) المُطبَّقة الآن على `warehouseId`/
`posDeviceId` أيضًا — راجع `docs/SECURITY.md` "POS/Sale — تفويض".

## Endpoints المرحلة الرابعة

### Purchases (`/api/v1/purchases`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/purchases` | قائمة أوامر الشراء (مُصفّاة حسب نطاق الفرع، فلاتر مورد/مستودع/حالة) | `purchases.read` |
| GET | `/purchases/:id` | تفاصيل أمر شراء (بنود + مورد) | `purchases.read` |
| POST | `/purchases` | إنشاء أمر شراء (لا يلمس المخزون أو المحاسبة بعد) — يتطلب `clientReferenceId` لحماية التكرار | `purchases.create` |
| POST | `/purchases/:id/receive` | استلام أمر شراء: يزيد المخزون + يُرحّل قيدًا محاسبيًا (مدين مخزون/ضريبة مدخلات، دائن ذمم دائنة) | `purchases.create` (لا صلاحية `receive` منفصلة) |
| POST | `/purchases/:id/cancel` | إلغاء أمر شراء **لم يُستلَم بعد فقط** (409 إن كان مُستلَمًا أو ملغى بالفعل) | `purchases.cancel` |

راجع `docs/PURCHASING.md` لتفاصيل تدفق الطلب→الاستلام والتزامن.

### Expenses (`/api/v1/expenses`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/expenses/categories` | قائمة فئات المصروفات (النشطة فقط) | `expenses.read` |
| POST | `/expenses/categories` | إنشاء فئة مصروف جديدة (مربوطة بحساب مصروف، افتراضيًا "مصروفات أخرى") | `expenses.create` |
| GET | `/expenses` | قائمة المصروفات (مُصفّاة حسب نطاق الفرع، فلاتر فئة/فرع) | `expenses.read` |
| GET | `/expenses/:id` | تفاصيل مصروف | `expenses.read` |
| POST | `/expenses` | تسجيل مصروف (مدفوع فورًا) + ترحيل قيده — يتطلب `clientReferenceId` | `expenses.create` |
| PATCH | `/expenses/:id` | تعديل مصروف — أي تغيير مالي (مبلغ/فئة/طريقة دفع) يعكس القيد القديم ويرحّل قيدًا جديدًا | `expenses.update` |
| DELETE | `/expenses/:id` | إلغاء ناعم لمصروف (`status: cancelled`) + عكس قيده النشط | `expenses.delete` |

راجع `docs/EXPENSES.md` لتفاصيل الفرق بين حقول "مالية" و"عرضية فقط" عند التعديل.

### Accounting (`/api/v1/accounting`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/accounting/accounts` | دليل الحسابات كاملًا (شجري عبر `parentId`) | `accounting.read` |
| POST | `/accounting/accounts` | إنشاء حساب جديد | `accounting.manage` |
| PATCH | `/accounting/accounts/:id` | تعديل حساب — `name`/`isActive` فقط (`code`/`type` غير قابلين للتعديل) | `accounting.manage` |
| GET | `/accounting/journal-entries` | قائمة القيود المحاسبية (مُصفّاة حسب نطاق الفرع، فلتر `referenceType`) | `accounting.read` |
| GET | `/accounting/journal-entries/:id` | تفاصيل قيد (بنوده وحساباتها) | `accounting.read` |

**لا `POST`/`PATCH`/`DELETE` تحت `/accounting/journal-entries` — عمدًا.**
القيود تُرحَّل فقط داخليًا من `Sales`/`Purchases`/`Expenses`؛ لا مسار API
لإنشاء أو تعديل أو حذف قيد مباشرة. راجع `docs/JOURNAL_ENTRIES.md`.

كل endpoints المرحلة الرابعة تخضع لنفس سلسلة الحراسة
(`JwtAuthGuard → MembershipGuard → PermissionsGuard`) + طبقة نطاق الفرع من
المرحلة 2.1، بالإضافة لنفس اتفاقية idempotency
(`clientReferenceId`/`P2002` catch-and-refetch) المُستخدَمة في `Sales`
منذ المرحلة 3.

## Endpoints Milestone 1: Accounting Completion

راجع `docs/ACCOUNTING.md` "Milestone 1: Accounting Completion" للتفصيل
الكامل خلف كل قسم من هذه الأربعة.

### التقارير المالية (`/api/v1/accounting/reports`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/accounting/reports/trial-balance` | ميزان المراجعة (`?dateFrom&dateTo`) — مجموع مدين/دائن لكل حساب + `isBalanced` | `accounting.reports.view` |
| GET | `/accounting/reports/general-ledger` | دفتر الأستاذ لحساب واحد (`?accountId&dateFrom&dateTo`) — رصيد افتتاحي محسوب + رصيد جارٍ لكل سطر، بحد أقصى 1000 سطر لكل طلب (Milestone 2 — راجع الملاحظة أدناه) | `accounting.reports.view` |
| GET | `/accounting/reports/profit-and-loss` | الأرباح والخسائر (`?dateFrom&dateTo`) — إيرادات/مصروفات + `netProfit` | `accounting.reports.view` |
| GET | `/accounting/reports/balance-sheet` | الميزانية العمومية (`?asOfDate`) — أصول/خصوم/حقوق ملكية + بند "أرباح مرحّلة غير مقفلة" محسوب (`computed: true`) | `accounting.reports.view` |

### الذمم المدينة/الدائنة (`/api/v1/accounting/ar`, `/ap`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/accounting/ar/customers` | أرصدة ذمم كل العملاء — تُعيد قائمة فارغة اليوم دائمًا (لا بيع آجل في النظام، راجع `docs/ACCOUNTING.md`) | `accounting.ar.view` |
| GET | `/accounting/ar/customers/:customerId` | كشف حساب عميل مفصَّل، بحد أقصى 1000 سطر (Milestone 2 — راجع الملاحظة أدناه) | `accounting.ar.view` |
| GET | `/accounting/ap/suppliers` | أرصدة ذمم كل الموردين (مُعبَّأة فعليًا — لا خطوة "دفع لمورد" بعد فتتراكم فقط) | `accounting.ap.view` |
| GET | `/accounting/ap/suppliers/:supplierId` | كشف حساب مورد مفصَّل، بحد أقصى 1000 سطر (Milestone 2 — راجع الملاحظة أدناه) | `accounting.ap.view` |

**ملاحظة Milestone 2 (حد أقصى، وليس Pagination كامل)**: دفتر الأستاذ
وكشوف الحسابات تُقرَأ كـ"عرض مستمر" واحد (مثل أي برنامج محاسبي حقيقي)،
لا كقائمة تُقلَّب صفحة بصفحة — الحد الأقصى 1000 سطر
(`MAX_LEDGER_LINES`/`MAX_STATEMENT_LINES` في `accounting-reports.service.ts`/
`subledger.service.ts`) يحمي الاستعلام فقط؛ الطريقة المقصودة لرؤية أكثر
من ذلك هي تضييق مدى التاريخ (`dateFrom`/`dateTo`)، لا صفحة تالية. لا
تغيير على صيغة الاستجابة.

### الأرصدة الافتتاحية المحاسبية (`/api/v1/accounting/opening-balance`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/accounting/opening-balance` | الرصيد الافتتاحي النشط الحالي، أو `null` | `accounting.read` |
| POST | `/accounting/opening-balance` | تسجيل رصيد افتتاحي جديد (قيد متوازن) — `409` إن وُجد رصيد نشط بالفعل | `accounting.opening_balance.manage` |
| POST | `/accounting/opening-balance/reverse` | عكس الرصيد النشط — `404` إن لم يوجد | `accounting.opening_balance.manage` |

مختلف تمامًا عن `POST /inventory/opening-balance` (رصيد افتتاحي مخزون،
منذ المرحلة 2) — راجع `docs/ACCOUNTING.md` "الأرصدة الافتتاحية
المحاسبية" لتوضيح الفرق.

### الفترات المحاسبية (`/api/v1/accounting/fiscal-periods`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/accounting/fiscal-periods` | قائمة الفترات المحاسبية | `accounting.read` |
| POST | `/accounting/fiscal-periods` | إنشاء فترة — `409` لفترة متقاطعة، `400` إن كان `startDate > endDate` | `accounting.period.manage` |
| POST | `/accounting/fiscal-periods/:id/close` | إقفال فترة — يمنع ترحيل/عكس أي قيد جديد طالما اليوم يقع ضمنها؛ `409` إن كانت مُقفلة بالفعل | `accounting.period.manage` |
| POST | `/accounting/fiscal-periods/:id/reopen` | إعادة فتح فترة — `409` إن كانت مفتوحة بالفعل | `accounting.period.manage` |

كل endpoints Milestone 1 تخضع لنفس سلسلة الحراسة
(`JwtAuthGuard → MembershipGuard → PermissionsGuard`) + طبقة نطاق الفرع
(`BranchScopeService`) على التقارير والذمم. لا `POST`/`PATCH`/`DELETE`
جديد على `/accounting/journal-entries` — الرصيد الافتتاحي وإقفال الفترة
كلاهما يمران عبر `JournalService` الموجودة أصلًا، وليس عبر أي مسار جديد
للتلاعب المباشر بقيد.

## Endpoints Milestone 3: Excel Import

راجع `docs/IMPORT_EXCEL.md` للتصميم الكامل خلف كل خطوة. رفع الملف
(`POST /imports/jobs`) هو الوحيد `multipart/form-data`؛ باقي الجسم عبر
`application/json` كالمعتاد.

| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/imports/entity-types` | أنواع البيانات المدعومة + حقولها المطلوبة/الاختيارية | `import.read` |
| GET | `/imports/jobs` | قائمة مهام الاستيراد لهذه المنشأة (مرقَّمة) | `import.read` |
| GET | `/imports/jobs/:id` | تفاصيل مهمة استيراد واحدة | `import.read` |
| POST | `/imports/jobs` | رفع ملف Excel (حقل `file`) + `entityType` (+ `targetWarehouseId` إلزامي لـ`opening_stock`) + `clientReferenceId` اختياري (idempotency) — يحلّل الملف فورًا ويقترح ربط الأعمدة | `import.create` |
| PATCH | `/imports/jobs/:id/mapping` | حفظ/تعديل ربط الأعمدة (`{mapping: {field: columnIndex}}`) | `import.create` |
| GET | `/imports/jobs/:id/preview` | معاينة كاملة (عدد صالح/به أخطاء + عيّنة) — **بلا أي كتابة** | `import.create` |
| POST | `/imports/jobs/:id/validate` | تحقق كامل من كل الصفوف، يُخزَّن على المهمة | `import.create` |
| POST | `/imports/jobs/:id/confirm` | التنفيذ الفعلي — يكتب كل صف صالح عبر الخدمة الموجودة أصلًا لنوعه؛ مؤمَّن (idempotent) على مستوى المهمة | `import.create` |
| POST | `/imports/jobs/:id/cancel` | إلغاء مهمة لم تُنفَّذ بعد | `import.create` |

لا `GET` لتنزيل الملف الخام لأي مهمة — غير مطلوب في هذه المرحلة، وتقليل
سطح الهجوم عمدًا (راجع `docs/IMPORT_EXCEL.md` "الأمان").

## Endpoints المراحل القادمة

تُضاف تدريجيًا: `/zatca` — يوثَّق في ملف الوحدة الخاص به عند البناء
الفعلي، تجنبًا لتوثيق Endpoints غير موجودة.
