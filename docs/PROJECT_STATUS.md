# حالة المشروع (Project Status)

**آخر تحديث**: 2026-08-15
**المرحلة الحالية**: إعادة هيكلة Auth/IAM لنموذج هوية Multi-tenant
(User/Tenant/Membership) — **مكتملة ومُختبرة**، قبل بدء المرحلة 2

## الحالة الإجمالية: 🟢 جاهز — بانتظار موافقتك الصريحة على بدء المرحلة 2

## ما تم إنجازه في هذه الدورة (إعادة هيكلة الهوية)

بناءً على طلب صريح: Qeedha Accounting منتج SaaS متعدد المستأجرين من اليوم
الأول، ولا يجوز افتراض `User = Company`. راجع `docs/DOMAIN_MODEL.md` للنموذج
الكامل.

- [x] إزالة `User.companyId` بالكامل من الكود وقاعدة البيانات — الهوية عالمية.
- [x] `Membership`: العلاقة الوحيدة بين User وCompany، tenant-scoped، RLS FORCE.
- [x] `MembershipRole` (يحل محل `UserRole`): الدور يُسنَد للعضوية، فيمكن لنفس
      الشخص أن يحمل دورًا مختلفًا تمامًا في كل منشأة (مُختبَر: Owner في A،
      Accountant في B لنفس الشخص).
- [x] تسجيل الدخول: عضوية واحدة → tokens مباشرة (بدون شاشة اختيار غير ضرورية)؛
      عضويتان فأكثر → `tenantSelectionRequired` + `tenantSelectionToken`
      قصير الأجل (سرّ توقيع منفصل تمامًا عن access token).
- [x] `POST /auth/select-tenant`، `POST /auth/switch-tenant`،
      `GET /auth/tenants` — أساس Tenant/Company Switcher الكامل.
- [x] كل تبديل/اختيار منشأة يتحقق من Membership نشطة فعليًا في قاعدة
      البيانات — لا يوجد مسار واحد يثق بـ`companyId` قادم من العميل مباشرة
      (مُختبَر صراحة: محاولة الوصول لمنشأة بلا عضوية تُرفض بـ403 دائمًا).
- [x] `MembershipGuard` جديد: عضوية `suspended` تفقد كل وصول فورًا، حتى على
      مسارات بلا `@RequirePermissions`، رغم أن الـaccess token صالح فنيًا.
- [x] `IamService.createUser` يُرفق مستخدمًا عالميًا موجودًا بمنشأة جديدة
      (اكتشاف بالبريد/الجوال) بدل افتراض أنه دائمًا شخص جديد — بدون لمس كلمة
      مروره أو اسمه، ومرفوض إن كانت له عضوية بهذه المنشأة بالفعل (409).
- [x] Migration بيانات آمن (`20260815120000_membership_identity_model`):
      كل مستخدم/دور سابق نُقل بلا فقدان بيانات (تفاصيل كاملة أدناه).
- [x] دور DB `qeedha_auth_lookup` أُعيد توجيهه من حماية `users` (لم تعد
      بحاجة لذلك، `users` غير محمي بـRLS إطلاقًا الآن) إلى حماية
      `memberships`/`companies`.
- [x] `docs/DOMAIN_MODEL.md` (جديد) + تحديث ARCHITECTURE/DATABASE/SECURITY/
      API/TESTING/CHANGELOG.
- [x] 16/16 اختبار e2e ناجح (10 من المرحلة 1 + 6 سيناريوهات تعدد منشآت
      جديدة)، build نظيف، lint نظيف (0 أخطاء).

## تقرير تفصيلي — إجابات على نقاط الطلب

**1) ما الذي تغيّر؟** إزالة `users.company_id` وجدول `user_roles`، إضافة
`memberships` و`membership_roles`، إعادة تصميم تدفق تسجيل الدخول ليدعم
عضويات متعددة، إضافة `MembershipGuard`، وتحديث كل نقطة في IAM/Auth كانت
تفترض ضمنيًا "مستخدم = منشأة واحدة".

**2) نموذج User/Tenant/Membership**: موثّق بالكامل في `docs/DOMAIN_MODEL.md`.
باختصار: `User` هوية عالمية بلا `company_id`؛ `Membership` هي العلاقة
الوحيدة به منشأة، وتحمل حالتها الخاصة (`active`/`suspended`)؛ الأدوار تُسنَد
لـ`Membership` لا لـ`User`.

**3) كيف يعمل اختيار المنشأة؟** بعد التحقق من كلمة المرور، إن كان للمستخدم
عضوية واحدة نشطة يحصل على tokens فورًا؛ إن كان لديه أكثر من واحدة يحصل على
`tenantSelectionToken` قصير الأجل (10 دقائق) وقائمة المنشآت، ثم يستدعي
`/auth/select-tenant` لإتمام الدخول لمنشأة محددة بعد تحقق صريح من العضوية.

**4) كيف يعمل Current Tenant Context؟** الـaccess token يحمل `sub` (userId)،
`companyId`، و`membershipId` معًا. كل الخدمات تستخدم هذا الثلاثي فقط — لا
مسار API واحد يقبل `companyId` من الطلب لتحديد النطاق.

**5) كيف تم الحفاظ على RLS؟** `memberships` و`membership_roles` الجديدان
يحملان نفس نمط `FORCE ROW LEVEL SECURITY` المستخدم في كل جدول tenant-owned
آخر منذ المرحلة 1. `users` أصبح بلا RLS إطلاقًا (ليس بيانات tenant من
الأساس)، وهذا قرار مقصود وليس إضعافًا للحماية — موثّق في `docs/SECURITY.md`.

**6) ما الذي تغيّر في JWT؟** الحمولة (payload) أصبحت `{ sub, companyId,
membershipId }` بدل `{ sub, companyId }`. أُضيف نوع token جديد منفصل تمامًا
(Tenant Selection Token) بسرّ توقيع خاص به (`JWT_TENANT_SELECTION_SECRET`).

**7) هل توجد أي migration خطرة؟** لا. الـMigration
(`20260815120000_membership_identity_model`) كُتب يدويًا لينسخ كل بيانات
`users`/`user_roles` الموجودة إلى `memberships`/`membership_roles` بلا
فقدان (كل مستخدم سابق كان له `company_id` واحد فقط، فالنسخ 1:1 بلا غموض)،
ثم يحذف الأعمدة/الجداول القديمة بعد التأكد من نجاح النسخ. طُبِّق واختُبِر
على قاعدتي التطوير والاختبار المحليتين بنجاح، مع تحقق يدوي من عدد الصفوف
قبل/بعد.

**8) نتيجة الاختبارات**: 16/16 ✅ (`npm run test:e2e`).

**9) نتيجة build/lint**: `tsc --noEmit` ✅، `nest build` ✅، `eslint` ✅ (0 أخطاء).

**10) تحديث PROJECT_STATUS.md**: هذا الملف نفسه.

## ما لم يبدأ بعد (بانتظار إذنك للانتقال)

المرحلة 2 (Products + Inventory + Customers + Suppliers) — راجع
`ROADMAP.md`. لا كود لأي من هذه الوحدات بعد. **لن يبدأ التنفيذ إلا بعد
موافقتك الصريحة.**

## قرارات معمارية مسجَّلة (متراكمة من المرحلة 1 وهذه الدورة)

- Shared-schema multi-tenancy مع RLS كخط دفاع ثانٍ (وليس schema-per-tenant).
- `email`/`mobile` عالميان (globally unique) — الآن لسببين: (أ) حل الهوية
  قبل معرفة أي tenant عند تسجيل الدخول، (ب) هوية واحدة عبر عدة عضويات.
- دور DB ثانٍ (`qeedha_auth_lookup`) بدل منح الدور الرئيسي BYPASSRLS — يحمي
  الآن `memberships`/`companies` بدل `users`.
- لا Interceptor عام للـAudit Log — استدعاءات صريحة من الخدمات لضمان دقة
  `before/after state`.
- لا تكامل مبذور (seeded) باسم "qeedha" في الكتالوج بعد — التزامًا صارمًا
  بعدم اختراع أي شيء متعلق بقيّدها قبل توفير عقد API الرسمي.
- Tenant Selection Token بسرّ توقيع مستقل عن access token، لمنع أي خلط
  مستقبلي بين الاثنين في أي Guard.

## قرارات تحتاج نقاشًا معك لاحقًا (مؤجَّلة عمدًا، ليست الآن)

- خوارزمية تقييم المخزون (FIFO/Weighted Average) — عند المرحلة 4.
- تفاصيل Offline POS الكاملة — عند المرحلة 3.
- الموجة/الحد المالي المطبَّق لـZATCA Phase 2 — عند المرحلة 6.
- عقد API الفعلي لقيّدها (Endpoints, Auth, Fields) — عند المرحلة 7، بانتظار
  توثيق منك.
- بريد دعوة فعلي (Invite email) عند إرفاق مستخدم موجود بمنشأة جديدة — حاليًا
  التاجر يُدخل بيانات الشخص مباشرة؛ إرسال رابط دعوة حقيقي تحسين مستقبلي
  موثَّق في `docs/DOMAIN_MODEL.md`.

## كيف تتحقق من الحالة الحالية محليًا

راجع `backend/README.md` لتعليمات التشغيل والاختبار. باختصار:
`npm install && npx prisma migrate deploy && npm run prisma:seed && npm run start:dev`
ثم `npm run test:e2e` للتأكد من نجاح كل الاختبارات (16/16 حاليًا).

## سجل تحديثات هذا الملف

- 2026-08-15: إنشاء الملف عند بدء المرحلة 1.
- 2026-08-15: المرحلة 1 مكتملة ومُختبرة (10/10 اختبارات e2e ناجحة، build/lint نظيفان).
- 2026-08-15: إعادة هيكلة Auth/IAM لنموذج User/Tenant/Membership مكتملة
  ومُختبرة (16/16، build/lint نظيفان) — بانتظار موافقة صريحة لبدء المرحلة 2.
