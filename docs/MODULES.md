# الوحدات (Modules)

جدول مرجعي سريع؛ التفاصيل الكاملة لكل وحدة رئيسية في ملفها المخصص
(`POS.md`, `ACCOUNTING.md`, `INVENTORY.md`, `IMPORT_EXCEL.md`, `ZATCA.md`,
`QEEDHA_INTEGRATION.md`).

| Module | المسؤولية | المرحلة |
|---|---|---|
| `tenancy` | Company, Branch, Warehouse, PosDevice | 1 |
| `iam` | Users, Memberships, Roles, Permissions, MembershipRoles (RBAC)، `BranchScopeService` (نطاق الفروع — 2.1) | 1 |
| `auth` | تسجيل الدخول، JWT access/refresh، تسجيل منشأة جديدة | 1 |
| `audit` | سجل العمليات الحساسة | 1 |
| `integrations` (core) | Ports عامة، IntegrationConnection، Webhook Inbox عام | 1 |
| `catalog` | المنتجات، التصنيفات، العلامات، الوحدات، الباركود | 2 — منفَّذ |
| `inventory` | رصيد المخزون، الحركات، التحويلات، الجرد | 2 — منفَّذ |
| `parties` | العملاء، الموردون | 2 — منفَّذ |
| `sales` / `pos` | الفاتورة، الدفع، المرتجعات، السلات المعلّقة، الوردية | 3 |
| `purchasing` | أوامر الشراء، الاستلام، فواتير الموردين | 3 |
| `expenses` | المصروفات وفئاتها | 3 |
| `accounting` | دليل الحسابات، القيود، الأستاذ، الميزانيات | 4 |
| `reports` | تقارير مالية وتشغيلية | 4 |
| `import` | Excel Import Wizard | 5 |
| `zatca` | الفوترة الإلكترونية | 6 |
| `integrations/providers/qeedha` | Adapter فعلي لقيّدها | 7 |

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
