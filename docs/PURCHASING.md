# المشتريات (Purchases) — Domain Transaction

راجع `docs/ACCOUNTING.md` للقيود المحاسبية الناتجة، و`docs/DOMAIN_MODEL.md`
"المرحلة 4" لموضع `Purchase` في النموذج العام. هذا الملف يوثّق `Purchase`/
`PurchaseItem` وتدفق الطلب→الاستلام بالتفصيل.

## النموذج

`Purchase` يحمل: `companyId`، `branchId` (**مُشتق من المستودع، وليس مُدخلًا**
— نفس مبدأ `Sale.branchId` من المرحلة 3)، `warehouseId`، `supplierId`،
`status` (`ordered`/`received`/`cancelled`)، `currency`،
`subtotal`/`discountAmount`/`taxAmount`/`totalAmount`، `referenceNumber`
(صيغة `PUR-000001`، ذرّي لكل منشأة)، `clientReferenceId` (مفتاح
idempotency)، `actorMembershipId`، `receivedAt`، `cancelledAt`. علاقة
`items` (`PurchaseItem[]`).

كل `PurchaseItem` ينسخ Snapshot وقت الشراء: `productName`، `productSku`،
`unitCost` (التكلفة الفعلية المتفاوض عليها لهذا الشراء تحديدًا — **لا
تُقرأ من `Product.costPrice`**، الذي يبقى مجرد سعر عرض افتراضي)، `vatRate`
(افتراضيًا من `Product.vatRate` وقت الشراء، قابل للتجاوز صراحة لكل بند).
نفس تبرير `docs/SALES.md` "تصميم الـSnapshot" ينطبق حرفيًا: أمر شراء
تاريخي يجب ألا يتغيّر بتغيّر بيانات المنتج لاحقًا.

## "الشراء هو الفاتورة" (Purchase IS the bill)

**لا جدول `PurchaseInvoice` منفصل.** `Purchase` نفسه يحمل كل مبالغ فاتورة
المورد (`subtotal`/`discountAmount`/`taxAmount`/`totalAmount`) ورقمًا
مرجعيًا ذرّيًا مضمون التفرّد — لا حاجة لكيان ثانٍ يعكس نفس البيانات. **لا
تنفيذ ZATCA** لفواتير الموردين (لا UUID، لا هاش، لا QR) — نفس موقف
`docs/SALES.md`/`docs/INVOICES.md` من هذه المرحلة تمامًا، والحقول الحالية
كافية لعرض الشراء وضريبته فقط.

## الترقيم (Numbering)

`PurchaseNumberService.issueNext(tx, companyId)` — عدّاد ذرّي لكل منشأة
(`purchase_sequences`, صف واحد لكل `companyId` هو نفسه المفتاح الأساسي)،
**نفس نمط `InvoiceNumberService` حرفيًا** (`docs/INVOICES.md` "الترقيم"):

```sql
INSERT INTO purchase_sequences (company_id, next_number)
VALUES ($1, 1) ON CONFLICT (company_id) DO NOTHING;

UPDATE purchase_sequences SET next_number = next_number + 1
WHERE company_id = $1
RETURNING next_number;  -- الرقم المُصدَر = القيمة المُعادة - 1
```

**الصيغة**: `PUR-######` (ترقيم تسلسلي مبطَّن بأصفار، بنفس بساطة `INV-######`).
مُختبَر صراحة بـ10 طلبات إنشاء شراء متزامنة حقيقية والتحقق أن كل رقم مرجعي
فريد بلا أي تكرار (`test/phase4.e2e-spec.ts`).

## تدفق الشراء: خطوتان صريحتان، وليس خطوة واحدة

**قرار معماري متعمَّد**: الشراء يمر بخطوتين منفصلتين، وليس معاملة واحدة كما
في `Sale`:

```text
POST /purchases              → Purchase.status = 'ordered'
                                لا يلمس المخزون ولا المحاسبة إطلاقًا

POST /purchases/:id/receive  → Purchase.status = 'ordered' → 'received'
                                يزيد المخزون + يُرحّل القيد المحاسبي
```

هذا يعكس واقع العمل الحقيقي في بقالة/سوبرماركت: البضاعة تُطلَب من المورد،
ثم تصل وتُستلَم لاحقًا — أحيانًا بواسطة شخص آخر غير من أنشأ أمر الشراء.
دمج الخطوتين في معاملة واحدة كان سيجبر التاجر على "استلام" بضاعة لم تصل
فعليًا بعد لمجرد تسجيل الطلب.

### `createPurchase` — الطلب فقط

يتحقق المستودع (ينتمي للمنشأة)، نطاق فرع العضوية لصلاحية `purchases.create`
(`BranchScopeService.assertBranchInScope`، نفس نموذج المرحلة 2.1)، المورد
(ينتمي للمنشأة)، وكل منتج في البنود. **ملاحظة**: لا يُشترط أن يكون المنتج
`isActive` — إعادة تخزين منتج معطَّل مؤقتًا شراء مشروع، بعكس بيعه. يحسب
المبالغ في الخادم، يولّد رقمًا مرجعيًا، وينشئ `Purchase` + `PurchaseItem[]`
بحالة `ordered`. لا `InventoryService.recordMovement`، لا `JournalService`
هنا.

### `receivePurchase` — الاستلام الفعلي

هذه هي الخطوة التي "تُفعّل" أمر الشراء فعليًا:

```text
تحقق نطاق الفرع لصلاحية purchases.create مقابل فرع أمر الشراء
→ UPDATE محروس ذرّي: status='received' WHERE status='ordered' (فائز واحد فقط تحت تزامن)
→ لكل بند: InventoryService.recordMovement (نوع 'purchase'، كمية موجبة)
→ ترحيل قيد محاسبي واحد (انظر أدناه)
→ Audit log (purchases.purchase.receive)
```

## التزامن (Concurrency)

**استلام مزدوج**: `receivePurchase` يستخدم `UPDATE purchases SET status =
'received', received_at = now() WHERE id = $1 AND company_id = $2 AND
status = 'ordered' RETURNING id` — إن أعاد صفرًا صفوفًا (الحالة ليست
`ordered` لحظة التنفيذ) يُرمى `409` **قبل** أي لمسة للمخزون أو المحاسبة.
نفس عائلة نمط الـUPDATE المحروس الذرّي المُثبَتة في
`InventoryService.recordMovement` منذ المرحلة 2 — لا فجوة قراءة-ثم-كتابة
يمكن استغلالها بطلبين متزامنين حقيقيين لاستلام نفس أمر الشراء مرتين
ومضاعفة المخزون. مُختبَر صراحة: استلام مزدوج تسلسلي (409 في الثانية)،
واستلام متزامن حقيقي (طلبان في نفس اللحظة تقريبًا — واحد فقط ينجح، المخزون
لا يتضاعف) (`test/phase4.e2e-spec.ts`).

**رقم مرجعي**: 10 طلبات إنشاء شراء متزامنة حقيقية → 10 أرقام `PUR-######`
فريدة بلا تكرار (نفس اختبار `InvoiceNumberService` من المرحلة 3، مُعاد على
`PurchaseNumberService`).

## Idempotency

`clientReferenceId` (فريد لكل `(companyId, clientReferenceId)`) — **نفس
النمط الحرفي من `Sale`/`docs/SALES.md`**: مسار سريع (بحث عن أمر شراء موجود
بنفس المفتاح، إعادته فورًا إن وُجد) + قيد تفرّد في قاعدة البيانات كخط دفاع
ثانٍ (`PurchasesController` يلتقط `P2002` ويُعيد جلب السجل الأصلي بدل خطأ
للمستخدم). مُختبَر بطلب مكرر تسلسليًا (`test/phase4.e2e-spec.ts`).

**ملاحظة**: الـidempotency هنا تحمي إنشاء أمر الشراء فقط، وليس عملية
`receivePurchase` — الاستلام يُحمى بدلًا من ذلك بالـUPDATE المحروس على
`status`، لأنه ليس عملية "إنشاء" لها مفتاح عميل، بل انتقال حالة صريح على
مورد موجود بالفعل.

## علاقة الشراء بالمخزون

`receivePurchase` يستدعي `InventoryService.recordMovement` (**نفس الدالة
الذرّية الوحيدة من المرحلة 2، غير مُعدَّلة إطلاقًا**) لكل بند، بنوع حركة
`purchase` وكمية موجبة. هذا هو نفس مسار الكتابة الوحيد المسموح لتعديل
`stock_levels.quantity_on_hand` في الكود بأكمله — لا مسار كتابة جديد
لأجل المشتريات.

## علاقة الشراء بالمحاسبة

عند الاستلام، يُرحَّل قيد واحد فقط عبر `JournalService.postJournalEntry`
(راجع `docs/JOURNAL_ENTRIES.md` للآلية العامة):

| الحساب | مدين | دائن |
|---|---|---|
| المخزون (`1200`) | `subtotal - discountAmount` | |
| ضريبة القيمة المضافة القابلة للاسترداد (`1300`) — فقط إن `taxAmount > 0` | `taxAmount` | |
| ذمم دائنة (موردون) (`2010`) | | `totalAmount` |

مُختبَر صراحة أن القيد متوازن رياضيًا (مدين = دائن) بعد كل استلام
(`test/phase4.e2e-spec.ts` "المشتريات"). لا سطر تكلفة بضاعة مباعة (COGS)
هنا — هذا قيد الاستلام (زيادة أصل المخزون)، وليس قيد بيع، فلا علاقة له
بتقييم المخزون المؤجَّل (`docs/ACCOUNTING.md` "مؤجَّل").

## الإلغاء (Cancel)

`POST /purchases/:id/cancel` (صلاحية `purchases.cancel` منفصلة عن
`purchases.create`) يعمل **فقط طالما الحالة `ordered`** — `409` إن كانت
`received` أو `cancelled` بالفعل. مرة استُلم الشراء، توجد بالفعل حركة
مخزون وقيد ذمم دائنة مرحَّل؛ التراجع عن ذلك مرتجع/إبطال حقيقي، وليس إلغاءً
بسيطًا (انظر "مرتجعات المشتريات" أدناه). إلغاء أمر `ordered` لا يلمس
المخزون أو المحاسبة إطلاقًا لأن `createPurchase` نفسه لم يلمسهما.

## نطاق الفروع/المستودعات (Branch Scope)

`PurchasesService` يستخدم `BranchScopeService.getScopeForPermission`/
`.assertBranchInScope` (نفس الخدمة من المرحلة 2.1، بلا أي تعديل) في ثلاث
نقاط: `createPurchase` (فرع المستودع)، `receivePurchase` (فرع أمر الشراء
المخزَّن)، `cancelPurchase` (فرع أمر الشراء المخزَّن). عضو مقيّد بفرع لا
يمكنه الشراء لمستودع فرع آخر بنفس المنشأة → `403`. أمر شراء من منشأة أخرى
تمامًا → `404` في كل نقطة (سلامة مرجعية عبر المنشآت، غير متأثرة بمنطق
النطاق). مُختبَر صراحة (`test/phase4.e2e-spec.ts`).

## RBAC

- `purchases.read` — قراءة القوائم والتفاصيل.
- `purchases.create` — **إنشاء واستلام معًا**. قرار متعمَّد: لا صلاحية
  `purchases.receive` منفصلة — نفس العضو الذي يملك صلاحية إنشاء أمر شراء
  يستطيع استلامه، اتساقًا مع اتفاقية النظام الحالية (صلاحية واحدة لكل نوع
  عملية كتابة رئيسية، وليس صلاحية لكل خطوة فرعية من نفس التدفق).
- `purchases.cancel` — منفصلة صراحة، تُمنح افتراضيًا لـManager/Owner فقط
  (راجع الأدوار الافتراضية في `docs/SECURITY.md`).

## مرتجعات المشتريات (Purchase Returns) — مؤجَّل عمدًا

لا جدول `purchase_returns`، لا Endpoint. تصميم الـSchema لا يمنع بناء هذا
لاحقًا (`PurchaseItem` يحتفظ بكل بيانات السطر الأصلية، ونمط
`recordMovement` نفسه قابل لإعادة الاستخدام لحركة إرجاع)، لكنه لم يُبنَ في
هذه المرحلة — يحتاج قرار عمل حول سياسة الاسترجاع من المورد (إرجاع كامل
للبضاعة؟ خصم من الفاتورة القادمة؟ استرداد نقدي؟) أولًا، تمامًا كما هو
مؤجَّل لمرتجعات المبيعات الجزئية في `docs/SALES.md`.
