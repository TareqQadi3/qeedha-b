# طبقة التكامل العامة (Integration Layer) — أساس مزوّدي الدفع الخارجيين

هذا الملف يوثّق البنية **العامة** (`modules/integrations`)، غير مرتبطة بأي
مزوّد بعينه. للتصميم الخاص بقيّدها تحديدًا كأول Adapter محتمل مستقبلًا، راجع
`docs/QEEDHA_INTEGRATION.md`. راجع `docs/PAYMENTS.md` لكيف تستهلك وحدة
`sales` هذه الطبقة (أو بالأحرى: لا تستهلكها بعد لطرق الدفع المحلية).

> **تحديث Milestone 9**: كل ما في هذا الملف (`modules/integrations`،
> `PaymentIntegrationPort`، `IntegrationRegistry`، Webhook inbox) يصف حصرًا
> اتجاه **Outbound** (Qeedha B تستدعي مزوّدًا خارجيًا) ولم يُمَس في
> Milestone 9. Milestone 9 أضاف وحدة **منفصلة تمامًا**
> (`modules/qeedha-integration`) لاتجاه **Inbound** مختلف كليًا (قيّدها
> تستدعي Qeedha B) — تعيد استخدام صفوف `integration_providers`/
> `integration_connections` نفسها (كتالوج + حالة ربط لكل منشأة) لكن بمنطق
> ومسارات API مختلفة تمامًا عن `IntegrationsController` هنا. راجع
> `docs/QEEDHA_INTEGRATION.md` §"تحديث Milestone 9" للتفصيل الكامل.

> **تحديث Phase 11**: `modules/integrations/providers/` لم يعد فارغًا -
> أُضيف أول Adapter حقيقي (`QeedhaPaymentProvider`، `providerKey:
> "qeedha_payments"`). **مفتاح مختلف عمدًا** عن `'qeedha'` الذي تستخدمه
> الوحدة الـInbound (`modules/qeedha-integration`) - الاتجاهان يتشاركان شكل
> جدول `IntegrationConnection` نفسه لكل شركة+`providerKey`، وعمود `status`
> فيه يحمل معنى حقيقيًا للاتجاه Inbound أصلًا؛ استخدام نفس المفتاح هنا كان
> سيجعل ربط/فصل هذا التكامل Outbound يكتب فوق حالة ربط Inbound لنفس الشركة
> بلا علاقة. `QEEDHA_PAYMENT_DRIVER` (متغيّر بيئة، القيمة الوحيدة المدعومة
> حاليًا `"none"`) يبقي كل استدعاء لـ`initiatePayment`/`getTransactionStatus`
> يرفض بخطأ واضح بدل تزييف نجاح - لا عقد API خارجي حقيقي من قيّدها منشور
> بعد لهذا الاتجاه، فلا يمكن اختلاقه. راجع
> `backend/src/modules/integrations/providers/qeedha-payment-provider.ts`.
> **لا وحدة `sales`/`payments`/POS تستدعي هذا الـAdapter بعد** - القسم
> "استقلالية qeedha B" أدناه لا يزال صحيحًا بهذا المعنى.

## لماذا "Payment Provider" وليس اسم مزوّد بعينه

قرار معماري ثابت منذ المرحلة 1، أُعيد تأكيده في المرحلة 3: لا تسمية أي
Interface أو Service باسم مزوّد محدد (`QeedhaPaymentService` ممنوع). التسمية
دائمًا عامة (`PaymentIntegrationPort`, `IntegrationRegistry`) لأن المستقبل قد
يحمل أكثر من مزوّد دفع، أو تكاملات من فئات مختلفة تمامًا (ERP، محاسبة). قيّدها
هو Connector واحد محتمل من ضمن هذه الطبقة، وليس الطبقة نفسها.

## المكوّنات (من المرحلة 1، غير مُعدَّلة في المرحلة 3)

- **`PaymentIntegrationPort`** (`core/ports/payment-integration.port.ts`):
  الواجهة الوحيدة التي يُسمَح لأي Core module (مثل `sales`) بمعرفتها.
  `initiatePayment(request): Promise<PaymentInitiationResult>`,
  `getTransactionStatus(externalTransactionId): Promise<PaymentTransactionStatus>`.
  حقول الطلب (`PaymentInitiationRequest`) تصميمنا الخاص، وليست نسخة من أي
  عقد API فعلي: `companyId`, `branchId?`, `invoiceReference`, `amount`
  (نص، وليس float)، `currencyCode`, `customerReference?`, `idempotencyKey`.
- **`IntegrationRegistry`**: سجل وقت التشغيل لأي Adapter مسجَّل
  (`register(adapter)`/`get(providerKey)`) — يحمل الآن Adapter حقيقي واحد
  (`qeedha_payments`، راجع تحديث Phase 11 أعلاه)، مسجَّل عند إقلاع
  `IntegrationsModule` (`OnModuleInit`). `IntegrationsService.connect()` لا
  يزال يرفض صراحة (`422`) أي محاولة ربط تكامل لا يملك Adapter مسجَّلًا، بدل
  تزييف نجاح الاتصال - يبقى صحيحًا لأي `providerKey` آخر غير مسجَّل.
- **`integration_providers`/`integration_connections`**: كتالوج + حالة ربط
  لكل منشأة، من المرحلة 1، بلا أي تعديل في المرحلة 3.
- **`integration_transactions`**: مُصمَّم في `docs/DATABASE.md` §10 لكن
  **غير مُضاف للـSchema بعد** — لا حاجة فعلية له طالما لا Adapter يستهلكه.

## كيف يتصل هذا بوحدة Sales/Payments (الوضع الفعلي في المرحلة 3)

**لا اتصال فعلي بعد.** طرق الدفع المحلية (`cash`/`card`/`transfer`/`other`)
لا تستدعي `IntegrationRegistry` أو `PaymentIntegrationPort` إطلاقًا — راجع
`docs/PAYMENTS.md` "طبقة واحدة، وليس طبقتين" للتبرير الكامل. القيمة الخامسة
`PaymentMethod.external` في مخطط `payments` محجوزة لهذا الاتصال المستقبلي:
حين يُسجَّل Adapter فعلي، يستدعي `SalesService` (أو خدمة دفع مستقبلية مخصصة)
`registry.get(providerKey).initiatePayment(...)` بدل الكتابة المباشرة
الحالية لصف `Payment` بحالة `success` فورية.

## Webhook inbox

`POST /api/v1/integrations/webhooks/:providerKey` (عام، موجود من المرحلة 1،
غير مُعدَّل) يستقبل أي Webhook خارجي في `webhook_events` بحالة `received`
افتراضيًا. لا معالج فعلي لأي `providerKey` مُسجَّل بعد — الجدول والمسار
جاهزان لاستقبال أول تكامل حقيقي دون معرفة أسماء أحداثه مسبقًا.

## استقلالية qeedha B

لا سطر كود واحد في `sales`/`payments`/`invoices` يستورد أي شيء من
`modules/integrations/providers/*` **حتى بعد Phase 11** - `QeedhaPaymentProvider`
موجود ومسجَّل في `IntegrationRegistry`، لكن لا شيء يستدعي
`registry.get('qeedha_payments').initiatePayment(...)` بعد. `PaymentMethod.external`
لا يزال قيمة محجوزة غير مُستخدَمة في `sales`/`payments` الفعليتين. حذف وحدة
`integrations` بالكامل الآن لن يكسر POS/Sales/Payments/Invoices — مُثبَت
عمليًا لأن لا استدعاء بينهما إطلاقًا في هذه المرحلة، لا نظريًا فقط.
