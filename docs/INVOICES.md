# الفواتير (Invoices)

## النموذج

`Invoice`: `companyId`, `branchId` (نفس فرع البيع)، `saleId` (فريد — فاتورة
واحدة بالضبط لكل بيع)، `customerId` اختياري، `invoiceNumber` (فريد لكل
منشأة)، `status` (`issued`/`cancelled`)، `currency`،
`subtotal`/`discountAmount`/`taxAmount`/`totalAmount` (نسخة من نفس مبالغ
البيع وقت الإصدار)، `issuedAt`، `cancelledAt`. علاقة 1:1 مع `Sale` — لا
تُنشَأ فاتورة أبدًا إلا داخل `SalesService.createSale` (`docs/SALES.md`)، ولا
يوجد Endpoint لإنشاء فاتورة مستقلة عن بيع.

## لماذا كيان منفصل عن Sale، وليس مجرد "نسخة عرض" من POS

الفاتورة كيان قابل للاستخدام لاحقًا خارج POS مباشرة: تقارير، تاريخ عميل،
مرتجعات، تكاملات خارجية (محاسبة، ZATCA). فصلها عن `Sale` يعني أن أي تغيير
مستقبلي على تمثيل الفاتورة (رقم مختلف، حالة امتثال ZATCA، إلخ) لا يمس نموذج
`Sale` نفسه، والعكس.

## الترقيم (Numbering)

`InvoiceNumberService.issueNext(tx, companyId)` — عدّاد ذرّي لكل منشأة
(`invoice_sequences`, صف واحد لكل `companyId` هو نفسه المفتاح الأساسي)، بنفس
نمط التحديث المحروس الذري المُثبَت في `InventoryService.recordMovement`
(المرحلة 2):

```sql
INSERT INTO invoice_sequences (company_id, next_number)
VALUES ($1, 1) ON CONFLICT (company_id) DO NOTHING;

UPDATE invoice_sequences SET next_number = next_number + 1
WHERE company_id = $1
RETURNING next_number;  -- الرقم المُصدَر = القيمة المُعادة - 1
```

طلبان متزامنان لنفس المنشأة يتسلسلان على قفل صف Postgres تلقائيًا — لا يمكن
لأي منهما رؤية أو إعادة استخدام رقم الآخر. مُختبَر صراحة بـ10 طلبات بيع
متزامنة حقيقية والتحقق أن كل رقم فاتورة فريد (`test/phase3.e2e-spec.ts`).

**الصيغة**: `INV-######` (ترقيم تسلسلي مبطَّن بأصفار، لا سنة ولا فرع ولا
سلسلة). مقصود التبسيط — لا حاجة عملية الآن لأكثر من نطاق لكل منشأة. آلية
العدّاد نفسها تدعم إضافة بادئة سنة/فرع/سلسلة لاحقًا (عدّاد إضافي بمفتاح مركّب
بدل `company_id` وحده) دون تغيير جوهر النمط الذرّي — تحسين مستقبلي موثَّق، لا
بناء زائد الآن.

## الحالة (Status)

`issued` (طبيعي) → `cancelled` (فقط عبر `POST /sales/:id/cancel`، لا Endpoint
مستقل لإلغاء فاتورة بمعزل عن بيعها — راجع `docs/SALES.md` "Cancel/void").
لا حالة `draft` — الفاتورة تُصدَر فقط بعد اكتمال البيع بالكامل (دفع + خصم
مخزون ناجحين) داخل نفس المعاملة.

## القراءة

`GET /invoices` (قائمة، مُصفّاة حسب نطاق فرع العضوية بصمت — نفس اتفاقية
المرحلة 2.1)، `GET /invoices/:id` (تفصيل، بما فيه بنود وdefault دفعات البيع
المرتبط). صلاحية واحدة `invoices.read` تكفي للاثنين — لا `invoices.create`
منفصلة لأنه لا Endpoint إنشاء مستقل (راجع `docs/API.md`).

## ما لم يُبنَ بعد (موثَّق صراحة، مُحدَّث Milestone 10)

- **QR (ZATCA Phase 1)**: **مُنفَّذ فعليًا منذ Milestone 4** — كل فاتورة
  تحمل رمز QR حقيقي مُشفَّر بصيغة TLV (`InvoiceCompliance`)، يظهر في
  `GET /invoices` وفي واجهة `/sales`. راجع `docs/ZATCA.md`.
- **طباعة/PDF فعلي، توقيع رقمي**: لا يزال غير مُنفَّذ - خارج نطاق كل
  الـMilestones المتفق عليها حتى الآن.
- **الفوترة الإلكترونية ZATCA Phase 2** (XML/UBL، `previous_invoice_hash`،
  CSID، الإرسال الفعلي لهيئة الزكاة والضريبة): لا يزال غير مُنفَّذ عمدًا —
  **BLOCKED BY EXTERNAL DEPENDENCY** (اعتمادات ZATCA حقيقية غير متاحة، قرار
  عمل/قانوني حول الموجة المطبَّقة يحتاج تأكيدًا خارجيًا) — راجع `docs/ZATCA.md`.
- **سلسلة/بادئة رقم فاتورة متعددة**: راجع "الترقيم" أعلاه.
