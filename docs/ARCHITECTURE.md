# البنية المعمارية (Architecture)

## 1. الستاك التقني

| الطبقة | الاختيار | السبب |
|---|---|---|
| Backend | NestJS + TypeScript | DI ونظام Modules/Guards/Interceptors يلائم متطلبات Multi-tenancy وRBAC وAudit بشكل طبيعي دون بناء إطار عمل خاص |
| قاعدة البيانات | PostgreSQL | دعم قوي لـ Row-Level Security، JSONB، Transactions الحقيقية اللازمة للمحاسبة Double-Entry |
| ORM | Prisma | Type-safety، Migrations واضحة، سهولة كتابة Middleware لفرض tenant scoping تلقائيًا |
| المصادقة | JWT (access قصير الأجل + refresh قابل للتدوير) | مناسب لـ API عام يخدم Web وPOS وموبايل لاحقًا، ولا يتطلب حالة مركزية للجلسة |
| كلمات المرور | Argon2id | معيار حديث موصى به أمنيًا |
| الواجهة الأمامية | React + TypeScript + Tailwind CSS (RTL أولًا) | تبدأ من المرحلة الثانية/الثالثة مع POS، ليست جزءًا من هذا التسليم |
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

```text
/backend
  /src
    /common            # Guards, Decorators, Filters, Tenant Context, Interceptors
    /modules
      /auth             # تسجيل الدخول، اختيار/تبديل المنشأة، refresh، تسجيل منشأة جديدة
      /iam              # Users, Memberships, Roles, Permissions, MembershipRoles (RBAC)
      /tenancy          # Company, Branch, Warehouse, PosDevice
      /audit            # Audit Log service + interceptor
      /integrations     # Integration Layer الأساسية (ports, registry, connections)
        /core            # Interfaces عامة (PaymentIntegrationPort ...)
        /webhooks        # استقبال أحداث خارجية عامة (generic inbox)
      # الوحدات التالية تُضاف بالمراحل القادمة:
      # /catalog /inventory /parties /sales /purchasing
      # /expenses /accounting /reports /import /zatca
    /prisma
      schema.prisma
      /migrations
  /test
/frontend                # يبدأ لاحقًا (React + Tailwind RTL)
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
  └── providers/        → (فارغ في المرحلة الأولى)
        ├── qeedha/       (يُبنى في المرحلة 7 بعد توفر API Contract)
        ├── payment-x/    (مستقبلًا)
        └── erp-y/        (مستقبلًا)
```

- `IntegrationProvider`: سجل بالتكاملات المتاحة نظريًا (metadata فقط: key,
  name, category).
- `IntegrationConnection`: إعداد فعلي لمنشأة معيّنة (حالة: غير مرتبط / جاري
  الربط / مرتبط / يحتاج إعادة مصادقة / متوقف)، بيانات اعتماد مشفّرة.
- لا يوجد أي كود خاص بقيّدها في هذه المرحلة — فقط البنية العامة القادرة على
  استضافته لاحقًا دون تعديل Core.

## 9. القرارات المفتوحة (تحتاج نقاشًا معك لاحقًا، ليست الآن)

- خوارزمية تقييم المخزون (FIFO أم Weighted Average) — تُقرَّر عند بناء وحدة
  المحاسبة/التقارير (مرحلة 4).
- نموذج Offline POS التفصيلي (Local DB في المتصفح/الجهاز، آلية Conflict
  Resolution) — يُصمَّم عند مرحلة POS (مرحلة 3) لأنه يحتاج قرار منصة الـPOS
  (Web PWA أم تطبيق مخصص).
- تفاصيل ZATCA Phase 2 (Wave/Threshold المطبّق على التاجر) — تُحسم عند مرحلة
  ZATCA (مرحلة 6) وتحتاج تأكيدًا منك حول الموجة الحالية.
- عقد API الفعلي لقيّدها — ينتظر توثيقًا منك عند مرحلة 7.
