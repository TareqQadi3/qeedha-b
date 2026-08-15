# حالة المشروع (Project Status)

**آخر تحديث**: 2026-08-15
**المرحلة الحالية**: Phase 3 — POS + Sales + Payments + Invoices + أساس
التكامل — **مكتملة ومُختبرة**، بانتظار موافقتك الصريحة لبدء المرحلة 4

## الحالة الإجمالية: 🟢 جاهز — بانتظار موافقتك الصريحة على بدء المرحلة 4

## ملخص: ما هذه المرحلة وما ليست

قلب qeedha B الأول القابل للاستخدام فعليًا: بيع حقيقي من نقطة بيع حقيقية،
بدفع محلي، بخصم مخزون ذرّي، وفاتورة برقم مضمون التفرّد — كل ذلك بلا أي
اعتماد على قيّدها. لم تُبنَ في هذه المرحلة: محاسبة كاملة (دفتر أستاذ، قيود)،
ZATCA فعلي، Qeedha Connector فعلي، Control Center، Website، اشتراكات فعلية،
نظام مرتجعات جزئي، ورديات كاشير، أو سلات معلّقة على الخادم — كلها موثَّقة
صراحة أدناه تحت "مؤجَّل عمدًا".

## ما تم إنجازه في هذه الدورة (المرحلة 3)

- [x] Prisma schema: 5 جداول جديدة (`sales, sale_items, payments,
      invoice_sequences, invoices`) — كل جدول بـ`FORCE ROW LEVEL SECURITY`
      + policy `tenant_isolation` مستقل. لا تعديل على أي جدول من المراحل
      السابقة.
- [x] 4 صلاحيات RBAC جديدة (`sales.read`, `sales.create`, `sales.cancel`,
      `invoices.read`)، تحديث الأدوار الافتراضية (Cashier يبيع بلا إلغاء؛
      Manager/Owner كل الصلاحيات؛ Accountant قراءة فقط).
- [x] وحدة `sales`: معاملة بيع ذرّية واحدة تغطي التحقق الكامل (مستودع، نطاق
      فرع العضوية، جهاز POS إن وُجد، عميل إن وُجد، كل منتج) → حساب المبالغ
      في الخادم فقط → Sale → SaleItems (Snapshot) → خصم مخزون عبر
      `InventoryService.recordMovement` الموجود أصلًا من المرحلة 2 (بلا أي
      تعديل عليه) → Payments (يدعم Split) → رقم فاتورة ذرّي → Invoice →
      Audit. إلغاء بيع كامل (لا مرتجعات جزئية بعد). Idempotency عبر
      `clientReferenceId` فريد لكل منشأة، مع معالجة سباق تزامن حقيقي.
- [x] وحدة `invoices` (قراءة فقط): `InvoiceNumberService` بترقيم تسلسلي ذرّي
      لكل منشأة، نفس نمط `recordMovement` الذرّي بالضبط.
- [x] `BranchScopeService`/`PosDevice` (من المرحلتين 2.1/1) استُهلكا فعليًا
      لأول مرة خارج وحدة `inventory` — بلا أي تعديل على نموذجهما.
- [x] واجهة أمامية حقيقية (`/pos`): بحث/مسح باركود، سلة، كمية وخصم لكل سطر،
      عميل اختياري، دفع (بما فيه Split payment)، إتمام بيع، نتيجة فاتورة؛
      شاشة `/sales` للقراءة. **اختُبرت عبر متصفح حقيقي (Playwright)**: مسار
      كامل ناجح (دخول → بحث → إضافة → كمية → عميل → دفع نقدي → إتمام → تحقق
      فاتورة/مخزون عبر الـAPI) + سيناريو فشل (مخزون غير كافٍ، بلا تغيّر في
      الرصيد، رسالة خطأ واضحة).
- [x] `test/phase3.e2e-spec.ts`: 25 اختبارًا جديدًا (تفويض/وظيفي/تزامن
      حقيقي/RBAC/RLS) — **63/63 إجمالًا بلا أي تراجع** عن المراحل 1/2/2.1.
- [x] توثيق جديد: `SALES.md`, `PAYMENTS.md`, `INVOICES.md`, `INTEGRATION.md`؛
      تحديث `POS.md` (من تصميم مرجعي لتوثيق تنفيذ فعلي)،
      `QEEDHA_INTEGRATION.md`, `SECURITY.md`, `DOMAIN_MODEL.md`,
      `DATABASE.md`, `API.md`, `TESTING.md`, `MODULES.md`, `CHANGELOG.md`.

## التقرير النهائي (بالصيغة المطلوبة)

# Phase 3 — POS + Sales + Payments + Invoices

**Status**: Completed

**POS**: PASS
**Sales**: PASS
**Payments**: PASS
**Invoices**: PASS
**Inventory Integration**: PASS (خصم ذرّي عبر `recordMovement` الموجود أصلًا،
لا مسار كتابة جديد)
**Branch Scope**: PASS (يُشتق من `warehouse.branchId`، مُتحقَّق عبر
`BranchScopeService` نفسه من المرحلة 2.1)
**Warehouse Scope**: PASS
**POS Device Security**: PASS (نفس فرع المستودع + نشط + نفس المنشأة)
**Tenant Isolation**: PASS (RLS + فحوصات تطبيقية صريحة، كما في كل مرحلة سابقة)
**RLS**: PASS (`FORCE ROW LEVEL SECURITY` على كل جدول جديد + اختبار RLS
مباشر)
**RBAC**: PASS (4 صلاحيات جديدة، مُختبَرة برفض 403 عند غيابها)
**Audit**: PASS (`sales.sale.complete`, `sales.sale.cancel`)
**Idempotency**: PASS (`clientReferenceId`، مُختبَر تسلسليًا و5 طلبات متزامنة
حقيقية)
**Concurrency**: PASS (عمليتا بيع متزامنتان حقيقيتان على نفس المنتج: واحدة
تنجح فقط، الرصيد لا يصبح سالبًا أبدًا؛ 10 طلبات متزامنة تُنتج 10 أرقام فاتورة
فريدة)
**Frontend**: PASS (شاشة POS حقيقية متصلة بالكامل بالـAPI)
**Browser Tests**: PASS (Playwright، مسار كامل + سيناريو فشل)
**E2E**: PASS (63/63، `npx jest --config ./test/jest-e2e.json --runInBand`)
**Build**: PASS (`nest build` + frontend `tsc --noEmit && vite build`، بلا
أخطاء)
**Lint**: PASS (`eslint . --ext .ts` / `--ext ts,tsx` — 0 أخطاء في الطرفين)
**Typecheck**: PASS (`tsc --noEmit` — 0 أخطاء في الطرفين)
**Security**: PASS (IDOR، نطاق فرع/مستودع/جهاز POS، لا ثقة بمدخلات العميل —
راجع `docs/SECURITY.md`)
**SaaS Readiness**: PASS (كل جدول جديد tenant-scoped بـRLS، كل عملية تمر عبر
نفس سلسلة الحراسة، لا انحراف عن نموذج Company/Membership/Role/Permission)
**Qeedha Integration Foundation**: PASS (`PaymentIntegrationPort`/
`IntegrationRegistry` من المرحلة 1 جاهزان بلا تعديل، `PaymentMethod.external`
محجوزة، لا API مخترع)
**Qeedha Independence**: PASS (لا استيراد واحد من `integrations/providers/*`
في `sales`/`payments`/`invoices` — النظام يعمل بالكامل بدون قيّدها، وهذا هو
الوضع الوحيد المُختبَر فعليًا)
**Documentation**: PASS (13 ملف توثيق جديد/محدَّث)

**Tests**: 63/63 (38 سابقًا + 25 جديدة)

### Files Changed
- **Backend (جديد)**: `src/modules/sales/**` (module, controllers, services,
  DTOs)، `src/modules/iam/branch-scope.service.ts` (إضافة
  `assertBranchInScope`)، `prisma/migrations/
  20260815180000_phase3_pos_sales_payments_invoices/`، `test/phase3.e2e-spec.ts`.
- **Backend (معدَّل)**: `prisma/schema.prisma`, `src/app.module.ts`,
  `src/modules/iam/constants/permissions.ts`,
  `src/modules/iam/constants/default-roles.ts`.
- **Frontend (جديد)**: `src/pages/PosPage.tsx`, `src/pages/InvoicesPage.tsx`.
- **Frontend (معدَّل)**: `src/App.tsx`, `src/components/Layout.tsx` (مسارا
  `/pos`, `/sales`).
- **Docs (جديد)**: `SALES.md`, `PAYMENTS.md`, `INVOICES.md`, `INTEGRATION.md`.
- **Docs (معدَّل)**: `POS.md`, `QEEDHA_INTEGRATION.md`, `SECURITY.md`,
  `DOMAIN_MODEL.md`, `DATABASE.md`, `API.md`, `TESTING.md`, `MODULES.md`,
  `CHANGELOG.md`, `PROJECT_STATUS.md` (هذا الملف).

### Database Changes
Migration واحدة (`20260815180000_phase3_pos_sales_payments_invoices`) — 5
جداول جديدة + 4 enums (`SaleStatus`, `PaymentMethod`, `PaymentStatus`,
`InvoiceStatus`) + RLS policies لكل جدول. طُبِّقت بنجاح على قاعدتي التطوير
والاختبار. لا تعديل ولا حذف لأي جدول من المراحل السابقة. أُنشئت عبر
`prisma migrate diff` + تطبيق يدوي (البيئة غير تفاعلية، فلا يمكن استخدام
`prisma migrate dev` مباشرة) — نفس الناتج المُولَّد تلقائيًا، بلا فرق.

### API Changes
راجع `docs/API.md` قسم "Endpoints المرحلة الثالثة": 4 مسارات تحت `/sales`
(قائمة/تفصيل/إنشاء/إلغاء)، مسارا قراءة تحت `/invoices`. كلها خلف نفس سلسلة
الحراسة (`JwtAuthGuard → MembershipGuard → PermissionsGuard`) + طبقة نطاق
الفرع من المرحلة 2.1.

### Frontend Changes
شاشة POS حقيقية (`/pos`) وشاشة مبيعات/فواتير للقراءة (`/sales`)، بنفس الهوية
البصرية الحالية (لم تُغيَّر). راجع `docs/POS.md` للتفصيل الكامل وما هو
مؤجَّل عمدًا في تصميم الواجهة.

### Architectural Decisions (قرارات مسجَّلة)
- **لا طبقة Payment abstraction ثانية**: أُعيد استخدام `PaymentIntegrationPort`/
  `IntegrationRegistry` من المرحلة 1 حرفيًا بلا تعديل، بدل بناء طبقة جديدة.
  طرق الدفع المحلية لا تمر عبرهما إطلاقًا — راجع `docs/PAYMENTS.md`.
- **Split payment مدعوم بنيويًا من اليوم الأول**: `Payment` علاقة واحد-إلى-
  متعدد مع `Sale`، تفاديًا لـMigration كاسرة لاحقًا لإضافته.
- **فحص النطاق في طبقة الخدمة، ليس Guard جديد**: نفس قرار المرحلة 2.1 يمتد
  حرفيًا — `BranchScopeService` بلا أي تعديل على نموذجه.
- **403 لخرق النطاق، 404 لعدم الانتماء للمنشأة، 409 لتعارض حالة** (جهاز POS
  غير نشط أو من فرع مختلف، بيع ملغى بالفعل): نفس اتفاقية رموز الحالة من
  المراحل السابقة، بلا استثناء.
- **قوائم القراءة تُصفَّى بصمت، لا تُرفض**: نفس اتفاقية المرحلة 2.1، مطبَّقة
  الآن على `/sales`/`/invoices`.
- **Idempotency على مستوى البيع الكامل، لا لكل دفعة على حدة**:
  `Sale.clientReferenceId` يغطي البيع وبنوده ودفعاته وفاتورته معًا، لأن كل
  هذه الكيانات تُنشأ فقط داخل نفس المعاملة الذرّية — راجع `docs/SALES.md`.
- **لا تجاوز سعر (Price override)**: `SaleItem.unitPrice` يُنسَخ دائمًا من
  السعر الحالي للمنتج؛ الخصم لكل سطر هو الآلية الوحيدة لتعديل القيمة، ومتاح
  لأي عضو يملك `sales.create` (بلا صلاحية تجاوز منفصلة في هذه المرحلة).
- **إلغاء كامل فقط، لا مرتجعات جزئية**: `Sale.status` يدعم فقط
  `completed`/`cancelled` — كافٍ لعدم "تجميد" التصميم ضد مرتجعات لاحقة دون
  بناء نظام كامل لم يُطلَب بعد.

### Known Limitations (موثَّقة صراحة، وليست ثغرات مسكوت عنها)
- **لا ورديات كاشير (Cash sessions)، لا سلات معلّقة على الخادم (Held carts)**
  — السلة تعيش في حالة المتصفح حتى الإتمام فقط. راجع `docs/POS.md` "مؤجَّل".
- **لا مرتجعات جزئية بالسطر** — إلغاء كامل للفاتورة فقط.
- **`IamService.assignRole`** لا يزال بلا فحص "هل مُسنِد الدور مخوَّل بهذا
  الفرع؟" (نفس القيد الموثَّق في تقرير المرحلة 2.1، لم يتغيّر).
- **`Payment.status = pending`** مدعوم في النموذج لكن غير مُنتَج فعليًا عبر
  أي تدفق HTTP حقيقي بعد — لا مزوّد خارجي يُنتج حالة معلّقة فعلية.
- **لا طابعة/PDF/QR فعلي للفاتورة** — العرض داخل الواجهة فقط.

### What is intentionally deferred (مؤجَّل عمدًا — وليس نسيانًا)
- نظام مرتجعات جزئي كامل (`sale_returns`) — يحتاج قرار عمل حول سياسة
  الاسترجاع أولًا.
- ورديات الكاشير (`cash_sessions`/`cash_movements`).
- السلات المعلّقة على الخادم (Hold/Resume عبر أجهزة مختلفة).
- Offline-first الكامل (طابور محلي، مزامنة تلقائية، حل تعارض المخزون) —
  الأساس (`clientReferenceId`) جاهز، التنفيذ الكامل لاحقًا.
- تجاوز السعر يدويًا بصلاحية منفصلة.
- طباعة/PDF/QR فعلي للفاتورة، والفوترة الإلكترونية ZATCA الكاملة.
- Qeedha Connector الفعلي (لا API مخترع، بانتظار عقد رسمي).
- Purchasing، Expenses، Accounting الكاملة، Control Center، Website،
  اشتراكات فعلية — **لم تُبنَ ولن تُبنى في هذه المرحلة**، كما هو مطلوب صراحة.

### Commit
commit منفصل ونظيف لهذه المرحلة فقط (بدون تعديل أو إعادة كتابة `6528174` أو
`5ac78e0`)، **بدون push** حسب التعليمات الصريحة. راجع رسالة الـcommit للـhash
النهائي.

### Push
NOT PUSHED

## ما لم يبدأ بعد (بانتظار إذنك للانتقال)

المرحلة 4 (محاسبة أساسية، وفق `ROADMAP.md`) — لا كود لأي من وحداتها بعد.
**لن يبدأ التنفيذ إلا بعد موافقتك الصريحة، ولن يُبدأ تلقائيًا.**

## قرارات تحتاج نقاشًا معك لاحقًا (مؤجَّلة عمدًا، ليست الآن)

- سياسة المرتجعات (جزئي بالسطر أم كامل فقط؟) — قبل بناء `sale_returns`.
- الحاجة الفعلية لورديات الكاشير قبل بناء `cash_sessions`.
- استراتيجية Offline-first الكاملة (طابور محلي، حل تعارض) — عند الحاجة
  الفعلية لدعم اتصال غير مستقر.
- خوارزمية تقييم المخزون (FIFO/Weighted Average) — عند المرحلة 4.
- الموجة/الحد المالي المطبَّق لـZATCA Phase 2 — عند المرحلة 6.
- عقد API الفعلي لقيّدها (Endpoints, Auth, Fields) — عند المرحلة 7، بانتظار
  توثيق منك.

## كيف تتحقق من الحالة الحالية محليًا

Backend: `cd backend && npm install && npx prisma migrate deploy && npm run
prisma:seed && npm run start:dev`، ثم `npm run test:e2e` (63/63 حاليًا).
Frontend: `cd frontend && npm install && npm run dev` (يتطلب backend يعمل
على `http://localhost:3000`).

## سجل تحديثات هذا الملف

- 2026-08-15: إنشاء الملف عند بدء المرحلة 1.
- 2026-08-15: المرحلة 1 مكتملة ومُختبرة (10/10 اختبارات e2e ناجحة، build/lint نظيفان).
- 2026-08-15: إعادة هيكلة Auth/IAM لنموذج User/Tenant/Membership مكتملة
  ومُختبرة (16/16، build/lint نظيفان) — بانتظار موافقة صريحة لبدء المرحلة 2.
- 2026-08-15: المرحلة 2 (Products/Inventory/Customers/Suppliers + Frontend)
  مكتملة ومُختبرة (33/33، build/lint/typecheck نظيفة) — بانتظار موافقة صريحة
  لبدء المرحلة 3.
- 2026-08-15: المرحلة 2.1 (Branch/Warehouse Authorization Hardening) مكتملة
  ومُختبرة (38/38، build/lint/typecheck نظيفة) — بانتظار موافقة صريحة لبدء
  المرحلة 3.
- 2026-08-15: المرحلة 3 (POS/Sales/Payments/Invoices + أساس التكامل) مكتملة
  ومُختبرة (63/63، build/lint/typecheck نظيفة في backend وfrontend، Playwright
  ناجح) — بانتظار موافقة صريحة لبدء المرحلة 4.
