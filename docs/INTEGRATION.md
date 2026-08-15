# طبقة التكامل العامة (Integration Layer) — أساس مزوّدي الدفع الخارجيين

هذا الملف يوثّق البنية **العامة** (`modules/integrations`)، غير مرتبطة بأي
مزوّد بعينه. للتصميم الخاص بقيّدها تحديدًا كأول Adapter محتمل مستقبلًا، راجع
`docs/QEEDHA_INTEGRATION.md`. راجع `docs/PAYMENTS.md` لكيف تستهلك وحدة
`sales` هذه الطبقة (أو بالأحرى: لا تستهلكها بعد لطرق الدفع المحلية).

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
  (`register(adapter)`/`get(providerKey)`) — فارغ حاليًا، لا Adapter حقيقي
  مسجَّل. `IntegrationsService.connect()` يرفض صراحة (`422`) أي محاولة ربط
  تكامل لا يملك Adapter مسجَّلًا، بدل تزييف نجاح الاتصال.
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
`modules/integrations/providers/*` (المجلد فارغ أصلًا — لا يوجد Adapter بعد).
حذف وحدة `integrations` بالكامل الآن لن يكسر POS/Sales/Payments/Invoices —
مُثبَت عمليًا لأن لا استدعاء بينهما إطلاقًا في هذه المرحلة، لا نظريًا فقط.
