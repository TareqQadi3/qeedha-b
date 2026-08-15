# حالة المشروع (Project Status)

**آخر تحديث**: 2026-08-15
**المرحلة الحالية**: Phase 2.1 — Branch/Warehouse Authorization Hardening
— **مكتملة ومُختبرة**، بانتظار موافقتك الصريحة لبدء المرحلة 3

## الحالة الإجمالية: 🟢 جاهز — بانتظار موافقتك الصريحة على بدء المرحلة 3

## ملخص: ما هذه الدورة (2.1) وما ليست

هذه **ليست** المرحلة 3. لم يُبنَ أي من POS/Sales/Purchases/Accounting/ZATCA/
تكامل قيّدها/Control Center/Website. هذه دورة تعزيز أمني ضيقة: إغلاق الفجوة
التي وثَّقها التقرير النهائي للمرحلة 2 صراحة تحت بند "Branch/Warehouse
Security ⚠️ جزئي" — عضو يملك صلاحية مخزون كان يستطيع التأثير على أي مستودع
تابع لمنشأته، بصرف النظر عن نطاق الفرع المُسنَد له.

## ما تم إنجازه في هذه الدورة (المرحلة 2.1)

- [x] **`BranchScopeService`** (وحدة `iam`، جديد): يحسب لعضوية معيّنة، ولصلاحية
      معيّنة، مجموعة الفروع التي يُغطّيها إسنادها لتلك الصلاحية —
      `MembershipRole.branchId = null` ⇐ كل الفروع، `branchId` محدَّد ⇐ ذلك
      الفرع وكل مستودعاته. لا جدول جديد — تفعيل لعمود موجود أصلًا منذ إعادة
      هيكلة Auth/IAM ولم يكن يُقرَأ من قبل.
- [x] **إنفاذ Permission + Scope معًا** في `InventoryService`/
      `StockCountService`: `assertWarehouseOwned` يقبل الآن `scope` اختياري
      ويرفض بـ403 إن كان المستودع تابعًا للمنشأة الصحيحة لكن لفرع خارج
      النطاق (متمايز عن 404 لعدم الانتماء للمنشأة إطلاقًا). مُطبَّق على: رصيد
      افتتاحي، تسوية، تحويل (كلا الطرفين)، إنشاء/قراءة-بمعرّف/تحديث سطور/
      اعتماد/إلغاء جرد.
- [x] **قوائم القراءة تُصفَّى لا تُرفض**: `GET /inventory/stock-levels`,
      `/movements`, `/stock-counts` تدمج شرط النطاق داخل استعلام Prisma
      نفسه (نتيجة فارغة صامتة لخارج النطاق)، بنفس اتفاقية عزل المستأجرين
      المعتمدة في كل قوائم النظام — بلا كسر أي اختبار قائم.
- [x] **`PermissionsGuard` لم يتغيّر** (لا يزال يفحص فقط "هل تملك هذه
      العضوية هذه الصلاحية في أي مكان بالمنشأة؟") — فحص النطاق قرار معماري
      واعٍ وُضع في طبقة الخدمة، حيث يُعرَف المورد (`warehouseId`) فعليًا، لا
      في الـGuard.
- [x] **Products/Customers/Suppliers لم تُمَس** — تبقى tenant-wide بلا أي
      قيد فرع، كما هي منذ المرحلة 2، بقرار مقصود موثَّق.
- [x] **لا أدوار جديدة** (لا `BranchManager`/`WarehouseManager`) — نفس نظام
      RBAC الحالي (Permission)، مع طبقة Scope فوقه فقط.
- [x] **5 اختبارات e2e جديدة** في `test/phase2.e2e-spec.ts` (قسم "نطاق
      الفروع/المستودعات") تغطي مصفوفة الاختبار كاملة: فرع مُصرَّح/غير
      مُصرَّح بنفس المنشأة، نطاق فرع يشمل كل مستودعاته، اتحاد نطاقين
      بإسنادَي دور، نطاق كامل تلقائي لفرع جديد (Owner)، عضوية معلَّقة تفقد
      الوصول فورًا، وسيناريو متعدد المستأجرين كامل (منشأتان، ثلاثة فروع،
      أربعة مستخدمين بنطاقات مختلفة). **33 اختبار المرحلة 2 استمرت بالنجاح
      كاملة بلا تراجع، بما فيها اختبار التزامن بـ10 طلبات — المجموع 38/38.**
- [x] توثيق كامل محدَّث: `DOMAIN_MODEL.md`, `SECURITY.md`, `MODULES.md`,
      `TESTING.md`, `PROJECT_STATUS.md` (هذا الملف).

## التقرير النهائي (بالصيغة المطلوبة)

# Phase 2.1 — Branch/Warehouse Authorization Hardening

**Status**: Completed

**Branch Authorization**: PASS
**Warehouse Authorization**: PASS
**Tenant Isolation**: PASS (غير مُتأثرة — RLS + `assertWarehouseOwned` كما
كانت، طبقة النطاق فوقها لا بديلة عنها)
**RLS**: PASS (لم تُعدَّل أي policy؛ لم تُستخدَم RLS لتطبيق نطاق الفرع —
قرار مسجَّل أدناه)
**RBAC**: PASS (لا أدوار جديدة، لا تعديل على نموذج Permission؛ `Permission +
Scope` طبقتان منفصلتان كما طُلب)
**IDOR Protection**: PASS (`inventory.adjust` صالحة + `warehouseId` لمنشأة
صحيحة لكن فرع خارج النطاق ⇐ 403، مُختبَر صراحة)
**Inventory Security**: PASS (كل مسارات الكتابة على مستودع محدد تفرض
Permission + Scope معًا)
**Tests**: PASS (38/38 — 33 قائمة + 5 جديدة، `npx jest --config
./test/jest-e2e.json --runInBand`)
**Build**: PASS (`nest build` بدون أخطاء)
**Lint**: PASS (`eslint . --ext .ts` — 0 أخطاء)
**Typecheck**: PASS (`tsc --noEmit` — 0 أخطاء)
**Documentation**: PASS (5 ملفات محدَّثة)

### Files Changed
- **Backend (جديد)**: `src/modules/iam/branch-scope.service.ts`.
- **Backend (معدَّل)**: `src/modules/iam/iam.module.ts` (تصدير
  `BranchScopeService`), `src/modules/inventory/inventory.module.ts`
  (استيراد `IamModule`), `src/modules/inventory/inventory.service.ts`
  (`assertWarehouseOwned` + `warehouseScopeFilter` + قوائم/عمليات محدَّثة),
  `src/modules/inventory/stock-count.service.ts` (نفس النمط لكل عمليات
  الجرد), `src/modules/inventory/inventory.controller.ts` (تمرير
  `membershipId`)، `test/phase2.e2e-spec.ts` (+5 اختبارات).
- **Docs (معدَّل)**: `DOMAIN_MODEL.md`, `SECURITY.md`, `MODULES.md`,
  `TESTING.md`, `PROJECT_STATUS.md` (هذا الملف).
- **لا تغيير على Prisma schema** — لا migration جديدة، `MembershipRole.branchId`
  و`Warehouse.branchId` كانا موجودين أصلًا منذ مراحل سابقة.
- **لا تغيير على الواجهة الأمامية** — رسائل 403 الجديدة تمر عبر نفس مسار
  معالجة أخطاء `ApiError` الموجود أصلًا (`frontend/src/api/client.ts`)، الذي
  يعرض بالفعل أي رسالة خطأ من الخادم دون حاجة لكود خاص بها. لم تُبنَ أي واجهة
  اختيار فرع/مستودع جديدة — كانت ستُعتبر إفراطًا في البناء خارج نطاق هذه
  الدورة الأمنية الضيقة.

### Architectural Decisions (قرارات مسجَّلة)
- **الفحص في طبقة التطبيق (Service)، وليس في `PermissionsGuard`**:
  `PermissionsGuard` يبقى بلا تغيير لأن سؤاله ("هل تملك هذه الصلاحية؟") عام
  وثابت الشكل، بينما سؤال النطاق ("أي فرع يتبعه هذا المورد المحدد؟") يحتاج
  معرفة جسم/معاملات الطلب التي تختلف شكلًا بين DTO وآخر (`warehouseId` مقابل
  `fromWarehouseId`/`toWarehouseId` مثلًا) — فرضه في نفس نقطة الفحص الموجودة
  أصلًا لسلامة المراجع عبر المنشآت (`assertWarehouseOwned`) أبسط وأكثر
  اتساقًا من إضافة طبقة Guard عامة تحتاج تفسير كل DTO.
- **403 لخرق النطاق، 404 لعدم الانتماء للمنشأة**: تمييز متعمَّد. 404 يبقى
  "هذا غير موجود لديك إطلاقًا" (سلامة مرجعية عبر المنشآت، كما في المرحلة 2).
  403 جديد يعني "هذا موجود في منشأتك فعلًا، لكن نطاقك لا يغطيه".
- **قوائم القراءة تُصفَّى بصمت، لا تُرفض**: خيار مقصود ليس اعتباطيًا — أول
  محاولة استخدمت `assertWarehouseOwned` (ترفض) في مسارات القوائم أيضًا،
  فكسرت اختبار عزل مستأجرين قائم من المرحلة 2 كان يتوقع 200 بنتيجة فارغة عند
  تمرير `warehouseId` من منشأة أخرى في استعلام قائمة. صُحِّح ليطابق الاتفاقية
  الموجودة أصلًا في كل قوائم هذا النظام (فلترة صامتة)، ويقتصر الرفض الصريح
  على عمليات المورد الواحد المحدد (تسوية/تحويل/جرد).
- **لا استخدام لـRLS لفرض نطاق الفرع**: RLS يبقى مخصصًا حصرًا لعزل
  المستأجرين (tenant isolation) — وهو الحد الذي طلبه المستخدم صراحة ("Tenant
  isolation must remain enforced at database level. Branch/warehouse
  authorization must be enforced at the appropriate application/domain
  boundary"). إضافة RLS policy تعتمد على `current_setting` لعضوية/نطاق فرع
  كانت ستُعقّد نموذج RLS الحالي (المبني على `company_id` فقط) دون فائدة
  تناسب حجم هذه الدورة.
- **`Permission` + `Scope`، وليس أدوار جديدة**: لا `BranchManager` ولا
  `WarehouseManager` — دور `Inventory Manager` الموجود يُسنَد الآن بنطاق فرع
  اختياري عبر `MembershipRole.branchId` الموجود أصلًا، بدل اختراع نظام صلاحية
  موازٍ.
- **Products/Customers/Suppliers تبقى tenant-wide**: لا مبرر عمل حقيقي حاليًا
  لتقييدها بفرع؛ تقييدها الآن كان سيُخالف "لا تُفرط في البناء".

### Known Limitations (موثَّقة صراحة، وليست ثغرات مسكوت عنها)
- **إنشاء/تعديل الفروع والمستودعات نفسها** (`tenancy.branches.manage`/
  `tenancy.warehouses.manage`) بلا فحص نطاق فرع — منطقي لأنها عمليات على
  مستوى المنشأة كاملة، لا على فرع قائم مسبقًا.
- **`IamService.assignRole`/`createUser`** يتحققان أن الفرع المُسنَد ينتمي
  لنفس المنشأة، لكن بلا فحص "هل مُسنِد الدور نفسه مخوَّل بهذا الفرع؟" — أي
  عضو يملك `iam.users.manage` (عادة نطاق كامل) يستطيع إسناد أي فرع لأي عضو.
  هذا امتداد منطقي لصلاحية إدارة المستخدمين نفسها في هذه المرحلة، وليس ثغرة؛
  تحسين مستقبلي محتمل إن احتاج العمل تفويض إدارة مستخدمين لمدير فرع واحد
  فقط.
- **POS (المرحلة 3)** لم يُبنَ بعد؛ `PosDevice.branchId` موجود من المرحلة 1
  وسيُعاد استخدام `BranchScopeService` نفسه حين تُبنى وحدة POS، لا نظام
  موازٍ جديد.

### Commit
commit منفصل ونظيف لهذه الدورة فقط (بدون تعديل أو إعادة كتابة commit المرحلة
2)، **بدون push** حسب التعليمات الصريحة. راجع رسالة الـcommit للـhash
النهائي.

## ما لم يبدأ بعد (بانتظار إذنك للانتقال)

المرحلة 3 (POS/Sales/Purchases/Expenses جزئيًا حسب الخطة، محاسبة أساسية) —
راجع `ROADMAP.md`. لا كود لأي من هذه الوحدات بعد. **لن يبدأ التنفيذ إلا بعد
موافقتك الصريحة، ولن يُبدأ تلقائيًا.**

## قرارات تحتاج نقاشًا معك لاحقًا (مؤجَّلة عمدًا، ليست الآن)

- خوارزمية تقييم المخزون (FIFO/Weighted Average) — عند المرحلة 4.
- تفاصيل Offline POS الكاملة — عند المرحلة 3.
- واجهة أمامية لاختيار/عرض نطاق الفرع عند إسناد دور — لم تُطلَب في هذه
  الدورة، ولم تُبنَ لتفادي الإفراط في البناء؛ يمكن إضافتها كتحسين لاحق على
  شاشة IAM الحالية.
- الموجة/الحد المالي المطبَّق لـZATCA Phase 2 — عند المرحلة 6.
- عقد API الفعلي لقيّدها (Endpoints, Auth, Fields) — عند المرحلة 7، بانتظار
  توثيق منك.

## كيف تتحقق من الحالة الحالية محليًا

Backend: `cd backend && npm install && npx prisma migrate deploy && npm run
prisma:seed && npm run start:dev`، ثم `npm run test:e2e` (38/38 حاليًا).
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
