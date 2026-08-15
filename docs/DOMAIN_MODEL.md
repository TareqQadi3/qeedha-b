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
