# الدفع (Payments)

## المبدأ: طرق محلية تعمل بلا أي تكامل خارجي

`cash`, `card`, `transfer`, `other` تعمل بالكامل دون قيّدها أو أي مزوّد آخر —
هذا مبدأ ثابت من مواصفات المشروع ("Qeedha B يعمل بدون Qeedha")، ومُختبَر
صراحة (`docs/PROJECT_STATUS.md` "Qeedha Independence"). القيمة الخامسة
`external` محجوزة لطرق دفع مستقبلية عبر مزوّد خارجي (قيّدها أو غيرها) —
موجودة في الـSchema والـEnum لكن **غير قابلة للاختيار من أي طلب API حاليًا**
(`CreateSaleDto` يقبل فقط القيم الأربع المحلية عبر `@IsIn`) لأنه لا يوجد
Adapter فعلي بعد. راجع `docs/INTEGRATION.md`.

## طبقة واحدة، وليس طبقتين

القرار المعماري الأهم في هذا الملف: **لم نبنِ طبقة abstraction ثانية**
("Payment Provider" جديدة) فوق ما بُني أصلًا في المرحلة 1. `modules/
integrations` كان يحمل بالفعل `PaymentIntegrationPort` (`initiatePayment`,
`getTransactionStatus`) و`IntegrationRegistry` منذ Phase 1، بلا أي مستهلك
حتى الآن. القرار: طرق الدفع المحلية **لا تمر عبر هذا الـPort إطلاقًا** —
`SalesService` يُنشئ صف `Payment` مباشرة بحالة `success` فوريًا، لأنه لا يوجد
اتصال خارجي فعلي يستدعي انتظاره. الـPort موجود ومُستهدَف حصرًا لطريقة
`external` مستقبلًا، حين يُبنى Adapter فعلي يستدعيه `SalesService` بدل
الكتابة المباشرة الحالية — دون تغيير شكل `Payment` نفسه.

## نموذج Payment

`Payment`: `companyId`, `saleId`, `method`, `status`
(`pending|success|failed|cancelled|refunded`), `amount`, `currency`,
`providerKey`/`externalReference`/`idempotencyKey` (فارغة دائمًا لغير
`external`), `actorMembershipId`, `createdAt`. **لا أسرار أو مفاتيح API
مُخزَّنة هنا أو في أي مكان آخر مرتبط بالدفع المحلي** — لا يوجد ما يُخزَّن
أصلًا لأن لا اتصال خارجي.

## الحالات الثلاث

الـSchema يدعم `pending`/`success`/`failed` (والحالتين الإضافيتين
`cancelled`/`refunded` لمزوّد خارجي مستقبلي) كما طُلب صراحة، رغم أن كل دفعة
محلية في المرحلة 3 تُكتَب مباشرة بحالة `success` (لا حاجة عملية لـ`pending`
بلا اتصال خارجي فعلي بلا انتظار). مُختبَر أن النموذج **يدعم** `pending` فعليًا
(إنشاء صف `Payment` بحالة `pending` مباشرة عبر Prisma في الاختبار، دون تدفق
HTTP يُنتجها فعليًا بعد — `test/phase3.e2e-spec.ts`) دون اختراع تدفق HTTP
وهمي له.

## Split Payments — مدعوم أصلًا في النموذج

`Payment` علاقة **واحد-إلى-متعدد** مع `Sale` (وليس عمودًا واحدًا على
`Sale`) — قرار مُتخذ عمدًا لأن الدفع المُجزَّأ (نقدي + بطاقة لنفس الفاتورة)
سيناريو بقالة قياسي شائع، وتغيير هذا لاحقًا من علاقة 1:1 كان سيتطلب Migration
كاسرة. الخادم يتحقق أن **مجموع مبالغ الدفعات المُرسلة = الإجمالي المحسوب
بالضبط** قبل إتمام أي بيع (400 إن لم يتطابق) — لا بيع بدفع جزئي غير مكتمل
ولا دفع زائد بلا تفسير.

## Idempotency

مفتاح Idempotency الفعلي المُطبَّق هو `Sale.clientReferenceId` على مستوى
عملية البيع **بأكملها** (البيع + كل دفعاته + فاتورته معًا)، وليس مفتاحًا
منفصلًا لكل دفعة — لأن الدفعات المحلية تُنشأ فقط داخل نفس معاملة إنشاء البيع،
فتكرارها محكوم تلقائيًا بنفس ضمان تفرّد `clientReferenceId`
(`docs/SALES.md` "Idempotency"). عمود `Payment.idempotencyKey` محجوز لمزوّد
خارجي مستقبلي يحتاج مفتاحه الخاص عند استدعاء `PaymentIntegrationPort`.

## ماذا يحدث لو انقطع قيّدها (أو أي مزوّد مستقبلي)؟

لا شيء يتأثر بالطرق المحلية — `cash`/`card`/`transfer`/`other` لا تعرف
`integrations` إطلاقًا. خيار `external` (حين يُبنى) يختفي فقط من واجهة اختيار
طريقة الدفع، تمامًا كما هو موثَّق في `docs/QEEDHA_INTEGRATION.md`.
