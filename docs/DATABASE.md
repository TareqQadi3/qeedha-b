# نموذج البيانات وقاعدة البيانات (Domain Model & Database)

هذا الملف يوثّق **نموذج البيانات الكامل المخطط له لكل المشروع**. الجداول
المُنفَّذة فعليًا في المرحلة الأولى محددة في نهاية الملف تحت "الحالة الحالية".
باقي الجداول تصميم مرجعي يُنفَّذ تدريجيًا مع كل مرحلة حسب `ROADMAP.md`، حتى لا
نبني مخططًا ضخمًا دفعة واحدة بدون اختبار.

## قواعد عامة على كل الجداول التجارية

```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
company_id    UUID NOT NULL REFERENCES companies(id),   -- tenant
branch_id     UUID REFERENCES branches(id),              -- NULL إذا كان الكيان على مستوى المنشأة
created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
created_by    UUID REFERENCES users(id),
updated_by    UUID REFERENCES users(id),
deleted_at    TIMESTAMPTZ                                -- soft delete
```

- **الأموال**: `NUMERIC(14,2)` مع عمود `currency_code` (SAR افتراضيًا) — لا
  نستخدم `FLOAT` إطلاقًا.
- **الكميات**: `NUMERIC(14,3)` لدعم الأصناف الموزونة، `INTEGER` فقط للأصناف
  التي لا تُجزَّأ.
- **الحذف**: Soft delete لكل ما له أثر مالي/قانوني (منتجات، فواتير، عملاء،
  موردون، قيود). Hard delete فقط للبيانات المؤقتة (جلسات منتهية، سلات معلّقة
  قبل الدفع الفعلي غير المستخدمة).
- **الفهرسة**: `(company_id, branch_id)` و`(company_id, deleted_at)` كحد أدنى
  على الجداول عالية الحركة.
- Postgres RLS مفعّلة على كل جدول تجاري (انظر `ARCHITECTURE.md` §4).

---

## 1. Tenancy & Identity (المرحلة 1 — منفّذ)

```text
companies            الشركة/المنشأة (tenant الجذر)
  - legal_name, trade_name, vat_number, cr_number, default_currency, status

branches              فرع تابع لمنشأة
  - company_id, name, code, address, is_default

warehouses            مستودع تابع لفرع (قد يكون أكثر من مستودع للفرع الواحد)
  - company_id, branch_id, name, code, is_default

pos_devices            جهاز نقطة بيع مسجَّل
  - company_id, branch_id, name, device_code, status

users                 مستخدم (على مستوى المنشأة، وليس الفرع)
  - company_id, full_name, email, mobile, password_hash, status, locale

roles                 دور (Owner/Manager/Cashier/Accountant/Inventory Manager + مخصّص)
  - company_id NULL للأدوار النظامية العامة، أو مخصّص لمنشأة معيّنة
  - name, is_system

permissions            صلاحية دقيقة (sales.void, inventory.adjust ...)
  - key (unique), category, description

role_permissions        ربط دور بصلاحياته
  - role_id, permission_id

user_roles             ربط مستخدم بدور ضمن نطاق (فرع أو المنشأة كاملة)
  - user_id, role_id, company_id, branch_id NULL = نطاق المنشأة كاملة

refresh_tokens          رموز التحديث (JWT refresh) — مع تدوير وإبطال
  - user_id, token_hash, expires_at, revoked_at, replaced_by_token_id

audit_logs              سجل العمليات الحساسة
  - company_id, actor_user_id, action, entity_type, entity_id,
    before_state JSONB, after_state JSONB, reason, branch_id, created_at
```

## 2. Catalog & Inventory (المرحلة 2)

```text
product_categories, brands, units
products                الاسم، SKU، Barcode أساسي، تصنيف، علامة تجارية، وحدة،
                        سعر تكلفة، سعر بيع، نسبة VAT، حد أدنى للمخزون، صورة
product_barcodes         باركود إضافي (يدعم أكثر من باركود لكل منتج)
stock_levels             رصيد صنف لكل (مستودع)
stock_movements           كل حركة IN/OUT (مصدرها: بيع/شراء/تحويل/تسوية/جرد)
                        — لا يُعدَّل stock_levels مباشرة أبدًا بدون سجل حركة
stock_transfers, stock_transfer_items    تحويل بين فروع/مستودعات
stocktakes, stocktake_lines               الجرد الدوري والفروقات
```

## 3. Parties (المرحلة 2)

```text
customers    الاسم، رقم الجوال، السجل الضريبي (إن وجد)، حد الائتمان، ملاحظات
suppliers    الاسم، جهة الاتصال، الشروط، الرصيد
```
تصميم بجدولين منفصلين (وليس Party موحّد) لأن نشاط بقالة/سوبرماركت لا يحتاج
عادةً كيانًا واحدًا يعمل كعميل ومورد معًا؛ الفصل أبسط وأوضح للتاجر.

## 4. Sales / POS (المرحلة 3)

```text
sales, sale_items         الفاتورة وبنودها
payments                  دفعات الفاتورة (تدعم Split payment)
                          method: cash | card | transfer | <integration_key>
sale_returns, sale_return_items
held_carts                السلات المعلّقة (Hold/Resume) — hard delete مسموح
cash_sessions             فتح/إغلاق الوردية لكل جهاز POS/كاشير
cash_movements            سحب/إيداع نقدي أثناء الوردية
```

**ملاحظة تصميمية مهمة لعمود `payments.method`**: هذا العمود لا يُقيَّد بقائمة
ثابتة تتضمن "qeedha" بشكل مُدمَج. القيم الأساسية (`cash`, `card`, `transfer`)
موجودة دائمًا. أي طريقة دفع إضافية من تكامل خارجي تُشتق من
`integration_connections.provider_key` النشطة للمنشأة — أي عمود `payments`
يحمل `integration_connection_id` اختياري بدل قيمة enum ثابتة. هذا يمنع ربط
Core Schema بأي مزوّد خدمة بعينه.

## 5. Purchasing (المرحلة 3)

```text
purchase_orders, po_items
goods_receipts, goods_receipt_items
supplier_invoices
purchase_returns
```

## 6. Expenses (المرحلة 3)

```text
expense_categories
expenses          المبلغ، الفئة، الفرع، طريقة الدفع، مرفق (إيصال)
```

## 7. Accounting (المرحلة 4)

```text
chart_of_accounts     دليل الحسابات (شجري: أصول/خصوم/حقوق ملكية/إيرادات/مصروفات)
journal_entries         قيد محاسبي (مصدره: تلقائي من عملية، أو يدوي)
journal_lines           بنود القيد (مدين/دائن) — يجب أن يتوازن كل قيد
fiscal_periods          فترات مالية قابلة للإغلاق (منع قيود بأثر رجعي بلا إذن)
opening_balances         الأرصدة الافتتاحية
```
كل عملية تجارية (بيع، شراء، مصروف، تسوية مخزون) تُنشئ قيدها تلقائيًا عبر
Accounting Service — لا إدخال يدوي مزدوج.

## 8. Import (المرحلة 5)

```text
import_jobs         ملف مرفوع، النوع (منتجات/عملاء/موردون/مخزون/أرصدة)، الحالة
import_job_rows       كل صف مع نتيجة المعالجة (نجاح/خطأ/تكرار) وسبب الخطأ
```
لا أعمدة ثابتة مفترضة لكل نوع بيانات — Mapping يُحفظ كـ JSONB لكل `import_job`
لأن أعمدة ملفات Excel تختلف من تاجر لآخر (انظر `IMPORT_EXCEL.md`).

## 9. ZATCA (المرحلة 6)

```text
invoice_compliance     حالة الإرسال لكل فاتورة (pending/cleared/reported/rejected)،
                       UUID، الهاش، previous_invoice_hash، QR payload، رد ZATCA
```
تصميم مفصّل في `ZATCA.md`. لا تُنفَّذ تفاصيل التوقيع/العقدة إلا بعد التأكد من
المتطلبات الحالية للهيئة عند الوصول لهذه المرحلة.

## 10. Integration Layer (بنية عامة تُبنى في المرحلة 1، بدون أي Provider فعلي)

```text
integration_providers      سجل التكاملات المتاحة (metadata فقط)
  - key (unique, e.g. "qeedha"), name, category (payment/erp/ecommerce/...), is_enabled_globally

integration_connections      إعداد تكامل فعلي لمنشأة معيّنة
  - company_id, provider_key, status (not_connected/connecting/connected/needs_reauth/disabled)
  - credentials_encrypted (بيانات اعتماد مشفّرة — بنية Provider-specific كـ JSONB مشفّر)
  - connected_at, last_verified_at

integration_transactions      سجل عام لأي عملية أُرسلت لتكامل خارجي (دفع أو غيره)
  - company_id, integration_connection_id, external_transaction_id,
    idempotency_key (unique), reference_type (e.g. 'sale'), reference_id,
    amount, currency_code, status (pending/success/failed/cancelled/refunded),
    request_payload JSONB, response_payload JSONB

webhook_events               صندوق وارد عام لأي Webhook خارجي
  - provider_key, received_at, headers JSONB, payload JSONB,
    processing_status (received/processed/failed), processed_at
```
هذه الجداول عامة تمامًا — لا حقل واحد فيها يخص قيّدها تحديدًا. تفاصيل قيّدها
(إن وُجدت) تُخزَّن داخل `credentials_encrypted` و`request_payload`/
`response_payload` كـ JSONB **بعد** توفر عقد API الرسمي، دون تعديل بنية الجدول.

---

## الحالة الحالية (Phase 1 — منفّذ في Prisma فعليًا)

الجداول المنفَّذة في `backend/prisma/schema.prisma` في هذا التسليم:

`companies, branches, warehouses, pos_devices, users, roles, permissions,
role_permissions, user_roles, refresh_tokens, audit_logs,
integration_providers, integration_connections, webhook_events`

`integration_transactions` مؤجَّل حتى وجود Use-Case فعلي يستهلكه (مرحلة POS/
Sales) — تعريفه موثّق هنا لكنه لن يُضاف للـSchema فارغًا بلا استخدام.

باقي الجداول (Catalog, Inventory, Sales, Purchasing, Accounting, Import,
ZATCA) ستُضاف عبر Migrations جديدة في مراحلها، وليس دفعة واحدة الآن.
