# تكامل قيّدها (Qeedha Integration)

> **تحديث المرحلة 3**: `PaymentIntegrationPort`/`IntegrationRegistry`
> الموصوفان أدناه أصبحا موثَّقين بتفصيل عام (بلا أي ذكر لقيّدها) في
> `docs/INTEGRATION.md`. وحدة `sales`/`payments` الفعلية **لا تستدعيهما بعد**
> — طرق الدفع المحلية (نقدي/بطاقة/تحويل) تعمل مباشرة بلا أي طبقة تكامل، راجع
> `docs/PAYMENTS.md`. لا شيء تغيّر في هذا الملف نفسه؛ لا يزال تصميمًا معماريًا
> فقط بلا Adapter فعلي لقيّدها.

## تحديث Milestone 9: اتجاهان، نموذج ربط واحد (Two directions, one connection model)

كل ما يلي هذا القسم (بدءًا من "تحذير ثابت لكل من يقرأ هذا الملف") يصف
اتجاهًا واحدًا فقط: **Outbound** — Qeedha B تستدعي قيّدها كمزوّد دفع عند
الدفع في POS. هذا الاتجاه **لا يزال تصميمًا معماريًا بلا أي تنفيذ**، بالضبط
كما كان قبل Milestone 9 — لم يُمَس حرف واحد فيه، ولم يُسجَّل أي Adapter في
`IntegrationRegistry`.

Milestone 9 نفّذ اتجاهًا **مختلفًا تمامًا**: **Inbound** — قيّدها (نظام خارجي
منفصل تمامًا) تستدعي *واجهة API جديدة* داخل Qeedha B لتسوية دفعات على
فواتير موجودة أصلًا. هذا الاتجاه **منفَّذ فعليًا ومُختبَر محليًا** (لا مقابل
بيئة قيّدها الحقيقية — راجع "الاعتماديات الخارجية" أدناه).

القرار المعماري: الاتجاهان يتشاركان **نفس** صفوف `IntegrationConnection`/
`IntegrationProvider` (المعياريتان في `docs/INTEGRATION.md`) — نفس مفهوم
"ربط تكامل لمنشأة معيّنة تحت `provider_key`"، لكن **العملية مختلفة في
نوعها**: تسجيل Adapter دفع خارج (Outbound) مقابل إصدار بيانات اعتماد وصول
داخلة (Inbound Credential) — لذلك بُنيا كخدمتين/Controller-ين منفصلين تمامًا
(`QeedhaConnectionService`/`QeedhaConnectionController` للـInbound، مقابل
`IntegrationsService`/`IntegrationsController` العامّين لأي Outbound Adapter
مستقبلي)، بلا أي تشارك منطق أو تعديل على الأول.

**ملاحظة تسمية مهمة**: `docs/DATABASE.md` §10 (قبل Milestone 9) كان يصف
جدول `integration_transactions` **عام** (لأي Adapter Outbound مستقبلي،
بحقول `reference_type`/`request_payload`/`response_payload` وحالات تشمل
`refunded`) لكنه **لم يُضَف للـSchema فعليًا** ("مؤجَّل"). Milestone 9 يستخدم
**نفس الاسم** `integration_transactions` لجدول **Inbound** مختلف الشكل تمامًا
(بلا Payload خام، بحالات `success/failed/cancelled` فقط، ومرتبط دومًا بـ
`Sale`/`Payment`/`Customer`/`Branch` حقيقيين). بما أن الجدول العام لم يكن
موجودًا فعليًا، لا تعارض Schema حقيقي — لكن أي تنفيذ مستقبلي لطبقة Outbound
عامة سيحتاج اسمًا مختلفًا (مثل `integration_outbound_transactions`) بدل الاسم
المحجوز سابقًا في التوثيق فقط.

### البنية الفعلية (Inbound) — `backend/src/modules/qeedha-integration/`

- **العميل النظامي (System actor)**: دور نظامي غير قابل لتسجيل الدخول
  باسم `Integration` (`companyId: null`, `isSystem`-like عبر `default-roles.ts`،
  صلاحياته: `customers.read/create`, `sales.read`, `sales.payment.record`
  فقط) + مستخدم نظامي عام واحد (`system+qeedha-integration@qeedha-b.internal`,
  `status: 'disabled'` يمنع تسجيل الدخول به تمامًا) + عضوية (`Membership`)
  تُنشأ كسولًا لكل منشأة عند أول ربط. هذه العضوية تُستخدَم كـ`actorMembershipId`/
  `actorUserId` لكل استدعاء لخدمات العمل الموجودة (`SalesService`،
  `CustomersService`) — يعيد استخدام RBAC/BranchScope/Audit كاملةً دون أي
  حالة استثنائية "بلا Actor" داخل تلك الخدمات.
- **الربط (`QeedhaConnectionService`, JWT + RBAC عاديان)**:
  `GET/POST/DELETE /api/v1/qeedha-integration/connection`. `POST` يُصدر
  `publicReference` (`qic_` + 24 خانة hex، مرجع عام غير معرّف قاعدة بيانات)
  وسرًّا عشوائيًا (32 بايت hex) **يُعرَض مرة واحدة فقط** في الاستجابة —
  يُخزَّن فقط كـ`secretHash` (SHA-256، نفس `hashToken` المُستخدَم لـ
  `refresh_tokens`) و`secretLastFour` للعرض الآمن. استدعاء `POST` لاحق
  = تدوير (Rotate): سر جديد فورًا، القديم يتوقف عن العمل. `DELETE` يُبطل
  `secretHash` ويسجّل `revokedAt` (بلا حذف الصف — للتدقيق التاريخي).
- **المصادقة الخارجية (`QeedhaIntegrationAuthGuard`)**: ترويسة
  `Authorization: Bearer <publicReference>.<secret>` — منفصلة كليًا عن
  JWT/جلسة التاجر. `publicReference` يُحل عبر **نفس** آلية `AuthLookupService`
  المُستخدَمة أصلًا لتسجيل دخول المستخدمين قبل توفر سياق Tenant (دور Postgres
  ضيق `qeedha_auth_lookup`، BYPASSRLS، صلاحيات SELECT على أعمدة محدَّدة فقط
  — امتداد جديد `prisma/manual-sql/003_auth_lookup_role_integration.sql`،
  لا آلية Bootstrap ثانية). السر يُقارَن بـ`crypto.timingSafeEqual` (وقت
  ثابت). سياق الشركة لكل طلب يُشتَق **حصرًا** من الربط المُصادَق عليه — لا
  مسار تحت هذا الـGuard يقبل `companyId` من الطالب إطلاقًا.
- **واجهة API الخارجية (`QeedhaTransactionService`/`QeedhaTransactionController`,
  `@Public()` + `QeedhaIntegrationAuthGuard` فقط، بلا سلسلة الحراسة العادية)**:
  - `POST /api/v1/qeedha-integration/customers/resolve` — يربط
    `externalCustomerReference` بعميل داخلي (`IntegrationCustomerMapping`،
    `@@unique([companyId, connectionId, externalCustomerReference])`)؛
    يُنشئ عميلًا جديدًا فقط عند أول ظهور للمرجع (يتطلب `name`)، محميًا من
    سباق التزامن بقفل Postgres Advisory (`pg_advisory_xact_lock`، ضمن
    المعاملة) بدل قفل Memory (كما يطلب القسم 20 من مواصفة الـMilestone).
  - `POST /api/v1/qeedha-integration/transactions` — **تسوية دفعة على
    فاتورة موجودة أصلًا، وليست عملية بيع جديدة** (قرار تصميمي: حمولة
    الطلب لا تحمل بنود بضاعة، فقط `externalMerchantId`،
    `externalCustomerReference`، `externalTransactionId`، `amount`،
    `currencyCode` (SAR فقط حاليًا)، `invoiceReference`، `branchReference`،
    `idempotencyKey`). يحل `invoiceReference` عبر `Invoice.invoiceNumber`
    الموجود، `branchReference` عبر `Branch.code` الموجود — **بلا** جداول
    Mapping جديدة لهما، لأنهما مرجعان خارجيان آمنان أصلًا. يستدعي
    `SalesService.recordExternalPayment` (طريقة عامة جديدة، ذاتها منطق
    `recordPayment` الموجود منذ Milestone 7 حرفيًا، بعد فصله إلى
    `recordPaymentCore` خاصة مشتركة — **لا محرك بيع/دفع ثانٍ**). فشل تجاري
    حقيقي (تجاوز الرصيد المستحق مثلًا) يُخزَّن كمعاملة `FAILED` حقيقية، لا
    خطأ 500 ولا `PENDING` مزيّف.
  - `GET /api/v1/qeedha-integration/transactions/:reference` — بحث
    بـ`idempotencyKey` أو `externalTransactionId`، مُعزول بالكامل بالمنشأة
    والربط (لا IDOR ممكن، لا اعتماد على معرّف قاعدة بيانات داخلي).
  - `POST /api/v1/qeedha-integration/transactions/:reference/cancel` —
    قاعدة حاسمة موثَّقة: معاملة `FAILED` (لم تُحرِّك مالًا حقيقيًا أصلًا)
    تُلغى بأمان؛ معاملة `SUCCESS` (دفعة حقيقية سُجِّلت بالفعل بنفس مسار
    `recordPayment` الموثوق) **لا يمكن إلغاؤها عبر هذا التكامل** — تُعيد
    `409` دائمًا وحاسمًا (لا يوجد في هذا المستودع آلية آمنة لعكس دفعة واحدة
    مُسدَّدة بمعزل عن سلة كاملة، وبناء محرك عكس محاسبي جديد خارج نطاق هذا
    الـMilestone صراحة)؛ معاملة `CANCELLED` تُعيد نفس الحالة (Idempotent).
- **Idempotency**: `IntegrationTransaction.idempotencyKey`
  (`@@unique([companyId, connectionId, idempotencyKey])`) هو مفتاح
  التكرار الرئيسي، مربوط بنفس القيمة على `Payment.clientReferenceId`
  الموجود أصلًا — الحماية من التكرار المتزامن الحقيقي تعتمد على قيد
  Unique في قاعدة البيانات (وليس قفلًا في الذاكرة): طلبان متطابقان تمامًا
  يتسابقان على `SELECT ... FOR UPDATE` لصف البيع نفسه داخل
  `recordPaymentCore` (نفس نمط Milestone 7)، الخاسر يفشل بـP2002 يُلتقَط
  على مستوى الـController ويُعاد جلب النتيجة الأصلية بدل تكرارها — **10
  طلبات متزامنة حقيقية (`Promise.all`) مُختبَرة صراحة: معاملة مالية واحدة
  فقط تُنشأ، البقية تحل لنفس النتيجة**.
- **RBAC**: صلاحيتان جديدتان فقط — `integration.read` (الاطلاع على حالة
  الربط)، `integration.manage` (ربط/تدوير/قطع). دور `Owner` يملكهما
  تلقائيًا (كل الصلاحيات)؛ لا صلاحية جديدة على أي مسار خارجي (المصادقة هناك
  عبر السر، لا RBAC بشري إطلاقًا).
- **RLS**: `integration_customer_mappings` و`integration_transactions`
  الجديدان بنفس نمط `FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy
  المُستخدَم في كل جدول تجاري منذ Phase 1، مُختبَر مباشرة عبر استعلام
  `prisma.withTenant` عابر للمنشآت في الاختبارات.
- **Rate limiting**: يعيد استخدام `ThrottlerModule` العام الموجود (100
  طلب/60 ثانية لكل IP افتراضيًا). مسار الربط (`POST connection`) محدود
  إضافيًا بـ40/60 ثانية (نفس رتبة حد تسجيل منشأة جديدة — عملية نادرة).
  مسار إرسال المعاملات محدود بـ300/60 ثانية (أعلى من الافتراضي، لأنه
  المسار عالي التكرار الشرعي لنظام POS خارجي). **قيد مُوثَّق بصدق**: الحد
  مبني على IP، ليس على الربط/المنشأة — إن مرّرت قيّدها حركة تجار متعددين
  عبر IP مشترك، هذا الحد يُطبَّق تراكميًا عليهم جميعًا. لا نظام Rate Limit
  ثانٍ مبني خصيصًا لهذا (استخدام النظام الموجود كما يطلب القسم 21 من
  المواصفة).
- **Webhooks**: **لم يُبنَ أي شيء جديد**. لا حدث حقيقي في هذا التصميم
  يستوجب Push خارج (كل استجابة API متزامنة وفورية — لا حالة `PENDING`
  حقيقية تحتاج إشعارًا لاحقًا). صندوق الوارد العام
  `POST /api/v1/integrations/webhooks/:providerKey` (Phase 1، غير مُعدَّل)
  يبقى جاهزًا لأي احتياج مستقبلي بلا تعديل.
- **الواجهة الأمامية**: صفحة `/integration` جديدة (`QeedhaIntegrationPage.tsx`)
  — عرض حالة الربط، ربط (يعرض المرجع العام والسر مرة واحدة فقط بتحذير
  واضح)، قطع اتصال (بتأكيد صريح قبل الاستدعاء). لا شاشة لإرسال/عرض
  معاملات فردية (قيّدها هي من تستدعي الـAPI، ليس التاجر عبر المتصفح) ولا
  أي بيانات وهمية.

### الاعتماديات الخارجية (External dependency) — لم يُختبَر ضد قيّدها حقيقية

**لا اتصال حقيقي بأي بيئة قيّدها فعلية تم إجراؤه أو يمكن ادّعاؤه.** كل
اختبار (`backend/test/milestone9.e2e-spec.ts`، امتداد `golden-path.spec.ts`)
يستخدم النظام نفسه كـ"مُستدعٍ خارجي" — يسجّل مستخدم HTTP طلبات تحمل نفس
شكل الحمولة الموثَّق أعلاه عبر `supertest`/Playwright ضد الـAPI الفعلي
والقاعدة الفعلية، لا Mock داخلي. هذا يتحقق من **العقد والسلوك محليًا
بدقة**، لكنه **ليس** "تكامل قيّدها مُنتَج فعليًا" — لا بيانات اعتماد قيّدها
حقيقية، لا بيئة قيّدها خارجية متاحة لهذه الجلسة. أي تقرير مستقبلي يجب أن
يفرّق بوضوح بين "مُنفَّذ ومُختبَر محليًا" و"مُتكامل إنتاجيًا مع قيّدها".

## تحذير ثابت لكل من يقرأ هذا الملف (بما فيه أي جلسة عمل مستقبلية)

**لا يوجد أي API Contract فعلي لقيّدها في هذا المستودع.** لا تُخترع:
Endpoints، طريقة Authentication، أسماء حقول Request/Response، أو معرّفات
قاعدة بيانات خاصة بقيّدها. عند الحاجة الفعلية، يوفّر المستخدم توثيق/عقد API
رسميًا من مشروع قيّدها (الموجود في منصة أخرى ولا نملك وصولًا إليه). حتى ذلك
الحين، هذا الملف يوثّق **البنية المعمارية فقط** التي تستقبل هذا التكامل لاحقًا.

## القاعدة المعمارية النهائية (من وثيقة المواصفات، محفوظة كما هي)

- البرنامج المحاسبي مستقل عن قيّدها.
- قيّدها مستقلة عن البرنامج المحاسبي.
- قيّدها بدون برنامج محاسبي = العميل + المبلغ فقط.
- قيّدها عند الربط = طريقة دفع داخل POS، لا أكثر.
- البرنامج المحاسبي لا يعيد بناء قيّدها. قيّدها لا تعيد بناء البرنامج المحاسبي.
- API هو الجسر بينهما.
- Integration Layer قابلة لإضافة تكاملات مستقبلية أخرى (قيّدها ليست الوحيدة).
- لا تكامل مستقبلي هو شرط لعمل النظام الأساسي.

## تقسيم المسؤوليات

| | البرنامج المحاسبي | قيّدها |
|---|---|---|
| المنتجات، الكميات، الأسعار | ✅ | ❌ (لا نكرر الكتالوج) |
| الفاتورة، المخزون، المبيعات | ✅ | ❌ |
| التحقق من العميل، الرصيد، التمويل، الخصم | ❌ | ✅ |
| حالة العملية، التسوية الخاصة بقيّدها | ❌ | ✅ |

## أين تظهر قيّدها في النظام

**الإعدادات → التكاملات → قيّدها**، بالحالات: غير مرتبط / جاري الربط / مرتبط /
يحتاج إعادة مصادقة / متوقف. هذه الشاشة تُبنى على `IntegrationConnection`
العام (انظر `DATABASE.md` §10) — لا شيء خاص بقيّدها في الجدول نفسه.

بعد الربط، تظهر "قيّدها" كخيار إضافي في شاشة الدفع بجانب نقدي/بطاقة/تحويل —
**فقط إذا كانت الحالة `connected`**. إن لم يكن التاجر مشتركًا، لا تظهر إطلاقًا.

## التدفق التصميمي المتوقع (مثال توضيحي من المواصفات، وليس تنفيذًا فعليًا)

```text
POS → الفاتورة → اختيار قيّدها → Qeedha Integration API → قيّدها →
التحقق والخصم → نتيجة العملية → POS → إتمام الفاتورة
```

## كيف يُبنى الـAdapter لاحقًا (مرحلة 7) بدون كسر الاستقلالية

1. Core (POS/Sales) يعرف فقط `PaymentIntegrationPort` (interface عام):
   ```ts
   interface PaymentIntegrationPort {
     initiatePayment(request: PaymentRequest): Promise<PaymentInitiationResult>;
     getTransactionStatus(externalId: string): Promise<PaymentStatus>;
     // + أي عملية أخرى يفرضها العقد الفعلي عند توفره
   }
   ```
2. `QeedhaAdapter implements PaymentIntegrationPort` يُبنى داخل
   `src/modules/integrations/providers/qeedha/` فقط بعد توفر العقد الرسمي.
3. `IntegrationRegistry` يسجّل الـAdapter تحت `provider_key = "qeedha"` ويربطه
   بسجل `integration_connections` الخاص بالمنشأة.
4. Core لا يستورد أي شيء من `providers/qeedha` مباشرة — فقط عبر الـRegistry
   والـInterface. هذا يضمن أن حذف مجلد `qeedha` بالكامل لا يكسر أي شيء آخر في
   النظام.

## الحد الأدنى التصميمي لعملية الدفع (من المواصفات — أمثلة تصميمية، ليست عقدًا نهائيًا)
External Transaction ID، Customer Reference، Amount، Currency، Invoice
Reference، Merchant/Integration Reference، Branch Reference عند الحاجة،
Idempotency Key. هذه الحقول تنعكس في `integration_transactions` العام
(`DATABASE.md` §10) وليس في جدول خاص بقيّدها.

## حالات العملية
`pending | success | failed | cancelled | refunded` — الفاتورة لا تُعتبر
مدفوعة عبر قيّدها إلا بعد استلام الحالة الصحيحة (استجابة مباشرة أو Webhook).
يجب التعامل مع: انقطاع الاتصال، إعادة المحاولة، الطلبات المكررة (عبر
`idempotency_key` الفريد)، تأخر الرد، Webhooks.

## Webhooks
تُستقبل عبر `POST /api/v1/integrations/webhooks/:providerKey` العام
(`webhook_events` — `DATABASE.md` §10)، ثم تُعالَج بمعالج خاص بكل
`provider_key`. أسماء الأحداث الفعلية لقيّدها (`transaction success` ...)
تُحدَّد عند توفر العقد — الجدول والمسار جاهزان لاستقبالها الآن دون معرفة
الأسماء مسبقًا.

## ماذا يحدث إذا فُصل قيّدها؟
النظام يستمر بالعمل بالكامل (نقدي/بطاقة/تحويل)، خيار "قيّدها" يختفي من شاشة
الدفع، والعمليات السابقة المرتبطة بقيّدها تبقى في سجلها التاريخي دون تأثير.
