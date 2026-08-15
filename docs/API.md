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
| GET | `/users` | أعضاء المنشأة (Memberships) وأدوارهم ضمنها | `iam.users.view` |
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

## Endpoints المراحل القادمة

تُضاف تدريجيًا: `/purchasing`, `/expenses`, `/accounting`, `/reports`,
`/import`, `/zatca` — كل منها يوثَّق في ملف الوحدة الخاص بها عند
البناء الفعلي، تجنبًا لتوثيق Endpoints غير موجودة.
