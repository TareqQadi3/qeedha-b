# الوحدات (Modules)

جدول مرجعي سريع؛ التفاصيل الكاملة لكل وحدة رئيسية في ملفها المخصص
(`POS.md`, `SALES.md`, `PAYMENTS.md`, `INVOICES.md`, `ACCOUNTING.md`,
`INVENTORY.md`, `IMPORT_EXCEL.md`, `ZATCA.md`, `INTEGRATION.md`,
`QEEDHA_INTEGRATION.md`).

| Module | المسؤولية | المرحلة |
|---|---|---|
| `health` | فحص حالة التطبيق + قاعدة البيانات (`GET /health`، `503` عند فشل الفحص — Milestone 2) | 1 — موسَّع في Milestone 2 |
| `tenancy` | Company, Branch, Warehouse, PosDevice | 1 |
| `iam` | Users, Memberships, Roles, Permissions, MembershipRoles (RBAC)، `BranchScopeService` (نطاق الفروع — 2.1) | 1 |
| `auth` | تسجيل الدخول، JWT access/refresh، تسجيل منشأة جديدة | 1 |
| `audit` | سجل العمليات الحساسة | 1 |
| `integrations` (core) | Ports عامة، IntegrationConnection، Webhook Inbox عام | 1 |
| `catalog` | المنتجات، التصنيفات، العلامات، الوحدات، الباركود | 2 — منفَّذ |
| `inventory` | رصيد المخزون، الحركات، التحويلات، الجرد | 2 — منفَّذ |
| `parties` | العملاء، الموردون | 2 — منفَّذ |
| `sales` | Sale/SaleItem/Payment/Invoice، خصم مخزون ذرّي، Idempotency (POS واجهة فقط — لا جدول له) | 3 — منفَّذ |
| `purchasing` | أوامر الشراء، الاستلام، فواتير الموردين | 4 |
| `expenses` | المصروفات وفئاتها | 4 |
| `accounting` | دليل الحسابات، القيود، الأستاذ، الميزانيات | 4 |
| `reports` | تقارير مالية وتشغيلية | 4 |
| `storage` | File Storage abstraction (`FileStorageProvider`, `local` driver — Milestone 3) | 3 — منفَّذ |
| `imports` | Excel Import Wizard (Upload→Detect→Map→Preview→Validate→Confirm) | 3 — منفَّذ |
| `einvoice` | ZATCA Phase 1 QR generation فقط (`EInvoiceService`, `TlvQrService`, `ZatcaProvider` port غير مُنفَّذ) | 4 — Phase 1 منفَّذ، Phase 2 Blocked |
| `integrations/providers/qeedha` | Adapter فعلي لقيّدها | 7 |

**ملاحظة نطاق**: مرتجعات جزئية (`sale_returns`)، ورديات كاشير
(`cash_sessions`)، والسلات المعلّقة على الخادم كانت مذكورة في تصميم مرجعي
مبكر لوحدة `sales`/`pos` لكنها **لم تُبنَ في المرحلة 3** — موثَّق صراحة في
`docs/POS.md`/`docs/SALES.md` "مؤجَّل عمدًا"، ليست نسيانًا.

## مبدأ الحدود بين الوحدات

- كل Module يعرّض Service عام (public API داخلي) ولا تصل الوحدات الأخرى إلى
  Prisma models الخاصة به مباشرة.
- الوحدات التي تُنشئ أثرًا محاسبيًا (sales, purchasing, expenses, inventory)
  تستدعي `AccountingService.postJournalEntry(...)` — لا تكتب قيودًا يدويًا.
  هذا يضمن توازن كل قيد ومصدر واحد للحقيقة المحاسبية.
- `integrations` هي الوحدة الوحيدة المسموح لها بمعرفة تفاصيل مزوّد خارجي، وحتى
  هي تُعرّض Interface عام على باقي النظام (انظر `QEEDHA_INTEGRATION.md`).

## المرحلة 2.1 — تفعيل نطاق الفروع/المستودعات (Branch & Warehouse Scope)

`inventory` أصبحت تستدعي `BranchScopeService.getScopeForPermission` من `iam`
(لذا `InventoryModule` يستورد `IamModule` الآن) قبل أي عملية تلمس مستودعًا
محددًا. راجع `docs/SECURITY.md` و`docs/DOMAIN_MODEL.md` للتفاصيل الكاملة —
لا وحدة جديدة، ولا جدول جديد، فقط تفعيل عمود `MembershipRole.branchId`
الموجود أصلًا منذ إعادة هيكلة Auth/IAM.

## Milestone 2 — بنية تحتية مشتركة عابرة للوحدات (Cross-Cutting)

لا وحدة أعمال جديدة في هذا الـMilestone. ثلاثة أجزاء بنية تحتية مُسجَّلة
على مستوى `AppModule` نفسه (لا تنتمي لأي `modules/*` بعينه):
`RequestIdMiddleware` (`src/common/middleware`، مُطبَّق على كل مسار عبر
`NestModule.configure()`)، `LoggingInterceptor`
(`src/common/interceptors`، `APP_INTERCEPTOR` عام)، و`buildCorsOptions`/
`assertCorsConfiguredForProduction` (`src/config/cors.config.ts`،
يُستدعيان من `main.ts` عند الإقلاع). راجع `docs/SECURITY.md` "CORS" و
"Logging المهيكل" للتفاصيل الكاملة.

## المرحلة 3 — وحدة `sales` الجديدة

`sales` (تضم `SalesController`/`SalesService` و`InvoicesController`/
`InvoicesService`/`InvoiceNumberService` في نفس الوحدة، لأن الفاتورة لا
تُنشأ إلا داخل معاملة إنشاء البيع) تستورد `IamModule` (لـ`BranchScopeService`)
و`InventoryModule` (لـ`InventoryService.recordMovement`، مسار خصم المخزون
الوحيد) — بلا أي وصول مباشر لـProduct/Customer/Warehouse Prisma models عبر
خدمة وسيطة، بنفس النمط المُتَّبع أصلًا في `InventoryService` (فحوصات ملكية
مباشرة عبر `tx` المشترك، وليس عبر كل خدمة مالكة). راجع `docs/SALES.md`،
`docs/PAYMENTS.md`، `docs/INVOICES.md` للتفاصيل الكاملة.

## Milestone 3 — وحدتا `storage` و`imports`

`storage` وحدة بنية تحتية صغيرة ومستقلة (لا تعرف شيئًا عن Excel/Import
تحديدًا) — تُصدِّر `StorageService` فقط. `imports` تستوردها، وتستورد أيضًا
`CatalogModule`/`InventoryModule`/`PartiesModule`/`AuditModule` الموجودة
أصلًا لتستدعي خدماتها العامة مباشرة (`ProductsService.create`،
`CatalogService.createCategory/createUnit`، `CustomersService.create`،
`SuppliersService.create`، `InventoryService.setOpeningBalance`) — بلا أي
وصول مباشر لـProduct/Customer/Supplier/StockLevel Prisma models من داخل
`ImportsService` نفسها، ونفس مبدأ الحدود بين الوحدات أعلاه. راجع
`docs/IMPORT_EXCEL.md` للتصميم الكامل.

## Milestone 4 — وحدة `einvoice`

وحدة صغيرة ومعزولة (`TlvQrService` ترميز TLV بحت، `EInvoiceService`
التنسيق) لا تستورد شيئًا من `sales`/`accounting`/`inventory` — العكس
صحيح: `SalesModule` يستورد `EInvoiceModule` (وليس العكس)، فـ`einvoice` لا
تعرف شيئًا عن Sale/POS/Accounting إطلاقًا، فقط تستقبل بيانات فاتورة جاهزة
وتُنتج سجل امتثال. `ports/zatca-provider.port.ts` واجهة معرَّفة غير
مُنفَّذة وغير مسجَّلة في أي مكان (لا `IntegrationRegistry`، لا أي Registry
آخر) — نقطة توسّع موثَّقة لـPhase 2 فقط. راجع `docs/ZATCA.md` للتفاصيل
الكاملة.
