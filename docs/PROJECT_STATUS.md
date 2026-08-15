# حالة المشروع (Project Status)

**آخر تحديث**: 2026-08-15
**المرحلة الحالية**: المرحلة 1 — الأساس (Architecture + Domain Model +
Database + Authentication + أساس النظام) — **مكتملة ومُختبرة**

## الحالة الإجمالية: 🟢 المرحلة 1 جاهزة — بانتظار إذنك للانتقال للمرحلة 2

## ما تم إنجازه

- [x] قراءة وثيقة المتطلبات كاملة.
- [x] توثيق `/docs` الكامل (15 ملفًا).
- [x] تصميم Architecture (طبقات، Multi-tenancy، Integration Layer العام).
- [x] تصميم Domain Model الكامل لكل الوحدات (منفَّذ جزئيًا حسب المرحلة).
- [x] تصميم Database Structure الكامل (منفَّذ فعليًا: جداول المرحلة 1 فقط).
- [x] Backend scaffold (NestJS + Prisma + PostgreSQL، migrations، docker-compose).
- [x] Multi-tenancy foundation: Company/Branch/Warehouse/PosDevice +
      Row-Level Security (FORCE) على كل جدول tenant-owned + تلقيم تلقائي
      عبر `PrismaService.withTenant`.
- [x] Auth module: تسجيل منشأة جديدة (Company+Branch+Warehouse+Owner
      تلقائيًا)، تسجيل دخول، JWT access + refresh بتدوير وكشف إعادة استخدام
      (session family revocation)، logout، `/auth/me`.
- [x] دور DB منفصل وضيق (`qeedha_auth_lookup`, BYPASSRLS + SELECT محدود) لحل
      مشكلة "bootstrap" تسجيل الدخول قبل معرفة الـtenant — موثّق في
      `docs/SECURITY.md`.
- [x] RBAC: Roles/Permissions/UserRoles (Role↔Permission↔Scope)، أدوار
      نظامية مبذورة (Owner/Manager/Cashier/Accountant/Inventory Manager)،
      `PermissionsGuard` + `@RequirePermissions`.
- [x] Audit Log module: تسجيل صريح (ليس Interceptor عام) لإنشاء
      المستخدمين وإسناد/إلغاء الأدوار وعمليات التكاملات، مع actor/before/after.
- [x] Integration Layer skeleton: `PaymentIntegrationPort` + `IntegrationRegistry`
      + `IntegrationConnection` CRUD + Webhook inbox عام — **بدون أي كود خاص
      بقيّدها**، الكتالوج فارغ عمدًا حتى مرحلة 7.
- [x] اختبارات e2e (10/10 ناجحة): تسجيل منشأة، تسجيل دخول (نجاح/فشل)، تدوير
      refresh token وكشف إعادة الاستخدام، RBAC (رفض 403 + عدم تسريب
      passwordHash)، عزل المستأجرين (تطبيقيًا وعلى مستوى RLS مباشرة)،
      Audit Log، وIntegration Layer (رفض connect بدون Adapter، ثم نجاحه بعد
      تسجيل Adapter تجريبي في الاختبار نفسه فقط).
- [x] Build نظيف (`tsc --noEmit`, `nest build`) وLint نظيف (0 أخطاء).

## ما لم يبدأ بعد (بانتظار إذنك للانتقال)

المرحلة 2 (Catalog/Inventory/Customers/Suppliers) وما بعدها — راجع
`ROADMAP.md`. لا كود لأي من هذه الوحدات بعد.

## قرارات معمارية اتُّخذت أثناء التنفيذ (تستحق نقاشًا إن أردت تغييرها)

- **email/mobile عالميان (globally unique) وليس per-company**: لازم لحل
  مشكلة تحديد الهوية قبل معرفة الـtenant عند تسجيل الدخول. يعني هذا أن
  المستخدم الواحد ينتمي لمنشأة واحدة فقط في هذه المرحلة (لا عضوية متعددة
  المنشآت بنفس البريد). التفاصيل في `prisma/schema.prisma` (تعليق على model
  User) و`docs/SECURITY.md`.
- **دور DB ثانٍ (`qeedha_auth_lookup`) بدل منح الدور الرئيسي BYPASSRLS**: حافظ
  على RLS كخط دفاع حقيقي لبقية النظام بدل تعطيله بالكامل من أجل مسار واحد.
- **لا Interceptor عام للـAudit Log**: استدعاءات صريحة من الخدمات لضمان دقة
  `before/after state`، بدل تسجيل كل طلب متغيّر بلا تمييز.
- **لا تكامل مبذور (seeded) باسم "qeedha" في الكتالوج بعد**: التزامًا صارمًا
  بعدم اختراع أي شيء متعلق بقيّدها قبل توفير عقد API الرسمي.

## قرارات تحتاج نقاشًا معك لاحقًا (مؤجَّلة عمدًا، ليست الآن)

- خوارزمية تقييم المخزون (FIFO/Weighted Average) — عند المرحلة 4.
- تفاصيل Offline POS الكاملة — عند المرحلة 3.
- الموجة/الحد المالي المطبَّق لـZATCA Phase 2 — عند المرحلة 6.
- عقد API الفعلي لقيّدها (Endpoints, Auth, Fields) — عند المرحلة 7، بانتظار
  توثيق منك.

## كيف تتحقق من حالة المرحلة 1 محليًا

راجع `backend/README.md` لتعليمات التشغيل والاختبار. باختصار:
`npm install && npx prisma migrate deploy && npm run prisma:seed && npm run start:dev`
ثم `npm run test:e2e` للتأكد من نجاح كل الاختبارات (10/10 حاليًا).

## سجل تحديثات هذا الملف

- 2026-08-15: إنشاء الملف عند بدء المرحلة 1.
- 2026-08-15: المرحلة 1 مكتملة ومُختبرة (10/10 اختبارات e2e ناجحة، build/lint نظيفان).
