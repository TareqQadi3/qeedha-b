# البنية المعمارية (Architecture)

## 1. الستاك التقني

| الطبقة | الاختيار | السبب |
|---|---|---|
| Backend | NestJS + TypeScript | DI ونظام Modules/Guards/Interceptors يلائم متطلبات Multi-tenancy وRBAC وAudit بشكل طبيعي دون بناء إطار عمل خاص |
| قاعدة البيانات | PostgreSQL | دعم قوي لـ Row-Level Security، JSONB، Transactions الحقيقية اللازمة للمحاسبة Double-Entry |
| ORM | Prisma | Type-safety، Migrations واضحة، سهولة كتابة Middleware لفرض tenant scoping تلقائيًا |
| المصادقة | JWT (access قصير الأجل + refresh قابل للتدوير) | مناسب لـ API عام يخدم Web وPOS وموبايل لاحقًا، ولا يتطلب حالة مركزية للجلسة |
| كلمات المرور | Argon2id | معيار حديث موصى به أمنيًا |
| الواجهة الأمامية | React 18 + Vite + TypeScript + Tailwind CSS (RTL أولًا) | بدأت فعليًا في المرحلة 2 (`/frontend`) — متصلة حقيقيًا بواجهات Products/Catalog/Inventory/Customers/Suppliers، لا بيانات وهمية |
| قائمة الانتظار/الأحداث (لاحقًا) | Redis / BullMQ | لمزامنة POS offline، إعادة محاولة Webhooks، مهام الاستيراد الثقيلة — تُضاف عند الحاجة الفعلية وليست جزءًا من المرحلة الأولى |

القرار بين NestJS/Express وPrisma/TypeORM اعتُمد افتراضيًا من معايير المشروع
(انظر ملاحظة اختيار الستاك). لا يوجد كود سابق في المستودع، لذلك هذا اختيار
ابتدائي وليس Migration من نظام قائم.

## 2. الطبقات المعمارية (Layered Architecture)

```text
┌─────────────────────────────────────────────────────────┐
│  API Layer (Controllers, DTOs, Guards, Interceptors)     │
├─────────────────────────────────────────────────────────┤
│  Application Layer (Services / Use-Cases)                 │
│  - منطق الأعمال، التنسيق بين الوحدات، القرارات            │
├─────────────────────────────────────────────────────────┤
│  Domain Layer (Entities, Value Objects, Invariants)        │
│  - قواعد العمل الأساسية (لا تعرف شيئًا عن HTTP أو DB)      │
├─────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                      │
│  - Prisma/Postgres, تخزين ملفات، بريد، طابعات إيصالات     │
├─────────────────────────────────────────────────────────┤
│  Integration Layer (Ports & Adapters)                       │
│  - Payment Providers, Qeedha, ERP, E-commerce...           │
│  - Core لا يعرف تفاصيل أي Adapter، فقط الـPorts (Interfaces)│
└─────────────────────────────────────────────────────────┘
```

نقطة التصميم الحرجة: **Integration Layer طبقة جانبية (side-plane) وليست في
مسار التنفيذ الأساسي**. أي Use-Case أساسي (مثل "إتمام عملية بيع") يعمل بالكامل
بدون أي Adapter مُفعَّل. عندما يُفعَّل Adapter (مثل قيّدها)، هو من "يستمع" إلى
نقاط توسّع محددة (extension points) — لا العكس.

## 3. تنظيم الكود (Monorepo Layout)

> **مُحدَّث في Milestone 10 (الإصدار النهائي)** — هذا القسم كان لا يزال يعكس
> لقطة المرحلة 2 (يصف `/sales /purchasing /expenses /accounting /reports
> /import /zatca` كـ"تُضاف بالمراحل القادمة")، رغم أن كل هذه الوحدات (وأربع
> وحدات أخرى: `einvoice`, `subscriptions`, `qeedha-integration`, `health`)
> مُنفَّذة وتعمل فعليًا منذ عدة مراحل. القائمة أدناه تعكس البنية الفعلية
> الحالية.

```text
/backend
  /src
    /common            # Guards, Decorators, Filters, Tenant Context, Interceptors,
                        # Pagination, Money utils, Request-ID middleware, Logging interceptor
    /config             # env.validation.ts (fail-closed), cors.config.ts (allowlist-only)
    /modules
      /auth             # تسجيل الدخول، اختيار/تبديل المنشأة، refresh (تدوير + كشف إعادة استخدام)، تسجيل منشأة جديدة
      /iam              # Users, Memberships, Roles, Permissions, MembershipRoles (RBAC)
      /tenancy          # Company, Branch, Warehouse, PosDevice
      /audit            # Audit Log service + interceptor
      /integrations     # Integration Layer العامة - Outbound فقط (ports, registry, generic webhook inbox)
        /core            # Interfaces عامة (PaymentIntegrationPort ...) - لا Adapter فعلي بعد
        /webhooks        # استقبال أحداث خارجية عامة (generic inbox)
      /catalog          # المنتجات، التصنيفات، العلامات، الوحدات، الباركود
      /inventory        # أرصدة المخزون، الحركات، التحويلات، الجرد، متوسط التكلفة المُرجَّح
      /parties          # العملاء، الموردون
      /sales            # POS، البيع الآجل/النقدي، الفواتير، الدفعات، مرتجعات المبيعات
      /purchases        # أوامر الشراء، الاستلام، دفعات الموردين، مرتجعات المشتريات
      /expenses         # فئات وقيود المصروفات
      /accounting       # دليل الحسابات، القيود، التقارير، الفترات المحاسبية، التسوية البنكية
      /imports           # استيراد Excel (تحليل، معاينة، تأكيد)
      /storage           # تخزين الملفات (محلي - قابل للاستبدال)
      /einvoice          # ZATCA Phase 1: QR TLV + سجل الامتثال
      /subscriptions     # الخطط، الاشتراك، الفترة التجريبية، حدود الاستخدام (Milestone 8)
      /qeedha-integration # تكامل قيّدها Inbound - ربط، مصادقة خارجية، تسوية معاملات (Milestone 9)
      /health             # فحص صحة التطبيق/القاعدة
    /prisma
      schema.prisma
      /migrations
      /manual-sql        # سكربتات DDL يدوية تتطلب صلاحيات Superuser (دور qeedha_auth_lookup)
  /test                  # e2e (Jest + Supertest) لكل مرحلة، ضد قاعدة بيانات حقيقية
/frontend                # React + Vite + TypeScript + Tailwind RTL
  /src
    /api                 # عميل HTTP + إدارة التوكن (localStorage) + إعادة المحاولة عند 401
    /state               # AuthProvider/useAuth
    /components           # مكوّنات UI عامة + Layout (RTL sidebar، تنبيهات اشتراك)
    /pages                # صفحة لكل وحدة خلفية (POS/Sales/Purchases/Inventory/Accounting/
                          # Reports/AR-AP/Import/Subscription/Qeedha Integration/...)
  /e2e                    # Playwright - رحلة التاجر الكاملة ضد الحزمة الحقيقية
/docs
```

## 4. Multi-Tenancy

نموذج **Shared Schema + tenant_id** (وليس Schema-per-tenant):

- كل الجداول التجارية تحمل `company_id` (tenant) و`branch_id` عند الحاجة.
- **Prisma Middleware** يفرض تلقيم `company_id` تلقائيًا على كل query انطلاقًا
  من Request Context (لا يمكن لمطوّر أن "ينسى" الفلترة).
- **Postgres Row-Level Security (RLS)** كخط دفاع ثانٍ مستقل عن كود التطبيق:
  كل جدول تجاري له Policy تمنع أي وصول خارج `current_setting('app.tenant_id')`.
  هذا يحمي حتى من خطأ برمجي مستقبلي.
- هذا القرار قابل لإعادة النظر لاحقًا فقط إذا احتاج عميل معيّن عزلًا تعاقديًا
  صارمًا (عندها Schema-per-tenant لذلك العميل تحديدًا)، وليس افتراضيًا للجميع.

## 5. نموذج الهوية والهيكل التنظيمي

**تحديث معماري مهم**: النموذج الموصوف هنا استُبدل بنموذج Membership كامل بعد
مراجعة SaaS-first — راجع `DOMAIN_MODEL.md` للتفاصيل الكاملة (User لا يحمل
`company_id`، العلاقة الوحيدة بينه وبين منشأة هي `Membership`، والمستخدم
الواحد قد يملك عدة عضويات في عدة منشآت بأدوار مختلفة تمامًا في كل منها).

```text
User (هوية عالمية - لا يملك company_id)
 └── Membership → Company (Tenant)
        ├── Branch
        │     ├── Warehouse (قد يكون أكثر من مستودع لكل فرع)
        │     └── PosDevice
        └── MembershipRole (دور هذا المستخدم في هذه المنشأة تحديدًا،
                             مع نطاق فرع اختياري)
```

## 6. RBAC

ثلاث طبقات منفصلة (لا نَدمجها)، **مُسنَدة إلى Membership وليس إلى User مباشرة**:

1. **Role** — حزمة صلاحيات مسمّاة (Owner, Manager, Cashier, Accountant,
   Inventory Manager + أدوار مخصّصة لاحقًا).
2. **Permission** — صلاحية دقيقة (`sales.create`, `sales.void`,
   `inventory.adjust`, `settings.integrations.manage` ...) مخزّنة كسجلات في
   جدول، وليست Enum ثابتة، حتى يمكن إضافة صلاحيات جديدة دون Migration لتغيير
   الأدوار الحالية.
3. **Scope** — الفرع أو المنشأة التي يسري عليها الدور
   (`MembershipRole.branch_id = NULL` يعني صلاحية على مستوى المنشأة كاملة).

يُفرض RBAC على مستويين:
- **Guard Layer**: `@RequirePermissions('sales.void')` يرفض الطلب قبل الوصول
  لقاعدة البيانات، عبر استعلام `MembershipRole` بـ`membershipId` من الـJWT
  context مباشرة (انظر `DOMAIN_MODEL.md` "Current Tenant Context").
- **Query Layer**: كل Repository/Service يستقبل نطاق المستخدم (tenant + scope)
  كمعامل إلزامي وليس اختياريًا.
- **MembershipGuard**: طبقة إضافية تعمل على كل طلب مُصادَق عليه (حتى بدون
  `@RequirePermissions`)، تتحقق أن الـMembership نفسها ما زالت `active` —
  تمنع استمرار وصول عضوية عُطِّلت أثناء صلاحية access token قصير الأجل.

## 7. Audit Log

جدول مستقل `audit_logs` (وليس فقط أعمدة `updated_by`) لكل عملية حساسة:
تغيير الأسعار، الصلاحيات، التكاملات، الاستيراد، عمليات الدفع الخارجية،
المرتجعات، الجرد، القيود المحاسبية. يُنفَّذ عبر Interceptor عام + استدعاء
صريح من الخدمات للحالات التي تحتاج `before/after state`.

## 8. Integration Layer — التصميم العام

موثّق بالتفصيل في `QEEDHA_INTEGRATION.md`، لكن المبدأ المعماري هنا:

```text
Core Domain (Sales, Payments, Inventory ...)
        │  يعرف فقط:
        │  - PaymentMethodProvider (interface)
        │  - IntegrationEventPublisher (interface)
        ▼
Integration Layer (src/modules/integrations)
  ├── core/           → الـPorts (Interfaces) + IntegrationRegistry
  ├── webhooks/        → Inbox عام لأي Webhook خارجي (يُوجَّه حسب provider_key)
  └── providers/        → لا يزال فارغًا (KNOWN LIMITATION، راجع أدناه)
        ├── qeedha/       (Outbound - لا يزال غير مُنفَّذ، ينتظر عقد API خارجي حقيقي من قيّدها)
        ├── payment-x/    (مستقبلًا)
        └── erp-y/        (مستقبلًا)
```

> **تحديث Milestone 9**: بدلًا من انتظار عقد Outbound خارجي من قيّدها،
> Milestone 9 بنى اتجاهًا **Inbound** منفصلًا تمامًا (`modules/qeedha-integration`
> — قيّدها تستدعي Qeedha B عبر عقد API صريح يملكه هذا المستودع نفسه، بدل
> انتظار Qeedha B تستدعي قيّدها). الـAdapter الـOutbound أعلاه (`providers/qeedha`)
> لا يزال غير مُنفَّذ بالكامل، وهذا **قرار نطاق مقصود** لا نقص تنفيذ — راجع
> `docs/QEEDHA_INTEGRATION.md` §"تحديث Milestone 9" للتفصيل الكامل.

- `IntegrationProvider`: سجل بالتكاملات المتاحة نظريًا (metadata فقط: key,
  name, category).
- `IntegrationConnection`: إعداد فعلي لمنشأة معيّنة (حالة: غير مرتبط / جاري
  الربط / مرتبط / يحتاج إعادة مصادقة / متوقف)، بيانات اعتماد مشفّرة.
- لا يوجد أي كود خاص بقيّدها في هذه المرحلة — فقط البنية العامة القادرة على
  استضافته لاحقًا دون تعديل Core.

## 9. القرارات المفتوحة سابقًا — حالتها النهائية (Milestone 10)

> هذا القسم وصف أسئلة معمارية مفتوحة أثناء المراحل المبكرة. كل هذه القرارات
> اتُّخذت أو حُسمت لاحقًا فعليًا؛ الحالة الحقيقية موثَّقة هنا بدل ترك القسم
> يوحي بأنها لا تزال مفتوحة.

- **خوارزمية تقييم المخزون**: **حُسمت ومُنفَّذة** — متوسط التكلفة المُرجَّح
  (Weighted Average)، لا FIFO (Milestone 6). FIFO/Lots تبقى خارج النطاق
  صراحةً (`docs/INVENTORY.md`).
- **نموذج Offline POS**: **لم يُبنَ، وهذا نهائي لهذا الإصدار** — الـPOS
  يعمل Online فقط (يتطلب اتصالًا حيًا بالـAPI لكل عملية بيع). لا Local DB
  في المتصفح، لا آلية Conflict Resolution. **KNOWN LIMITATION**، ليس خطأ
  تنفيذ — لم يُطلَب صراحةً في أي مرحلة منفَّذة.
- **تفاصيل ZATCA Phase 2** (Wave/Threshold، XML/UBL، التوقيع الرقمي، CSID،
  الإرسال الفعلي لهيئة الزكاة والضريبة): **لا تزال غير مُنفَّذة عمدًا** —
  فقط Phase 1 (QR Code) مُنفَّذ (`docs/ZATCA.md`). **BLOCKED BY EXTERNAL
  DEPENDENCY** — تتطلب قرار عمل/قانوني حقيقي حول الموجة المطبَّقة على
  التاجر، واعتمادات ZATCA حقيقية (CSID) غير متاحة في أي بيئة تطوير توفّرت
  حتى الآن. خارج نطاق كل الـMilestones المتفق عليها صراحة.
- **عقد API الفعلي لقيّدها**: **حُسم بشكل مختلف عمّا كان متوقَّعًا هنا** —
  بدل انتظار عقد Outbound من قيّدها، Milestone 9 بنى اتجاه **Inbound**
  (قيّدها تستدعي Qeedha B عبر عقد يملكه هذا المستودع). راجع القسم 8 أعلاه
  والتحديث فيه. اتجاه Outbound (`providers/qeedha`) يبقى غير مُنفَّذ —
  **BLOCKED BY EXTERNAL DEPENDENCY** (عقد API Outbound خارجي حقيقي من
  قيّدها غير متاح).
