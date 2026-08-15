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

## 1. Tenancy & Identity (المرحلة 1 — منفّذ، مُحدَّث بعد Auth/IAM refactor)

**النموذج الكامل والمنطق موثّق في `DOMAIN_MODEL.md`.** الجداول:

```text
companies            الشركة/المنشأة (tenant الجذر)
  - legal_name, trade_name, vat_number, cr_number, default_currency, status

branches              فرع تابع لمنشأة
  - company_id, name, code, address, is_default

warehouses            مستودع تابع لفرع (قد يكون أكثر من مستودع للفرع الواحد)
  - company_id, branch_id, name, code, is_default

pos_devices            جهاز نقطة بيع مسجَّل
  - company_id, branch_id, name, device_code, status

users                 هوية عالمية - لا تحمل company_id ولا تخضع لـRLS إطلاقًا
  - full_name, email (فريد عالميًا), mobile (فريد عالميًا), password_hash,
    status, locale

memberships            العلاقة الوحيدة بين مستخدم ومنشأة (tenant-scoped، RLS)
  - company_id, user_id, status (active/suspended)
  - قيد فريد (company_id, user_id): عضوية واحدة لكل شخص في كل منشأة

roles                 دور (Owner/Manager/Cashier/Accountant/Inventory Manager + مخصّص)
  - company_id NULL للأدوار النظامية العامة، أو مخصّص لمنشأة معيّنة
  - name, is_system

permissions            صلاحية دقيقة (sales.void, inventory.adjust ...)
  - key (unique), category, description

role_permissions        ربط دور بصلاحياته
  - role_id, permission_id

membership_roles       ربط Membership (وليس User) بدور ضمن نطاق
  - company_id (مُكرَّر لتبسيط RLS), membership_id, role_id,
    branch_id NULL = نطاق المنشأة كاملة

refresh_tokens          رموز التحديث (JWT refresh) — مع تدوير وإبطال
  - user_id, membership_id, company_id (الجلسة مرتبطة بـtenant مُختار مسبقًا)،
    token_hash, expires_at, revoked_at, replaced_by_token_id

audit_logs              سجل العمليات الحساسة
  - company_id, actor_user_id, action, entity_type, entity_id,
    before_state JSONB, after_state JSONB, reason, branch_id, created_at
```

**تغييرات جوهرية عن التصميم الأول** (كانت `users.company_id` NOT NULL و
`user_roles` مرتبط بالمستخدم مباشرة) — استُبدلت بالكامل بنموذج Membership
عبر Migration بيانات آمن (`20260815120000_membership_identity_model`، راجع
`docs/DOMAIN_MODEL.md` والملف نفسه للتفاصيل). لا تعتمد على `UserRole` أو
`users.company_id` في أي كود جديد — هذان الاسمان لم يعودا موجودين.

## 2. Catalog & Inventory (المرحلة 2 — منفَّذ)

```text
units                   وحدة قياس (اسم + رمز اختياري)، tenant-scoped
product_categories       تصنيف هرمي (parent_id اختياري، ذاتي العلاقة)
brands                  علامة تجارية، tenant-scoped
products                sku (فريد لكل منشأة)، الاسم، الوصف، تصنيف/علامة/وحدة
                        اختيارية، سعر تكلفة، سعر بيع، نسبة VAT، الحد الأدنى
                        للمخزون، isActive، image_key (مفتاح تخزين فقط)
product_barcodes         باركود إضافي (فريد لكل منشأة، وليس عالميًا)
stock_levels             رصيد صنف لكل (مستودع) - عمودا quantity_on_hand
                        وreserved_quantity (الأخير غير مُستخدَم بعد، أساس
                        لحجز POS في المرحلة 3)
stock_movements           سجل append-only لكل حركة (IN موجب/OUT سالب):
                        opening_balance/purchase/sale/return/adjustment/
                        transfer_in/transfer_out/damage/expiry/manual_correction
                        — لا يُعدَّل stock_levels مباشرة أبدًا بدون سجل حركة
stock_adjustments         تسوية مخزون (سبب + مرجع لحركة المخزون الناتجة)
stock_counts, stock_count_lines           جرد (draft/completed/cancelled)،
                        كل سطر يقارن الكمية المتوقعة بالمعدودة
```

**قواعد التفرّد** (Uniqueness rules، حُسمت صراحة عند التصميم):
`sku` و`barcode` فريدان **لكل منشأة**، وليس عالميًا — منشأتان مختلفتان قد
تستخدمان نفس الـSKU أو نفس الباركود دون أي تعارض، ومُختبَر صراحة
(`test/phase2.e2e-spec.ts`). `product_categories.name`/`brands.name` غير
فريدين حتى داخل نفس المنشأة عمدًا (تكرار الاسم سيناريو تجاري حقيقي)؛ سلامة
الإشارة بين منتج وتصنيف/علامة/وحدة من نفس المنشأة تُفرض على مستوى التطبيق
(كل خدمة تتحقق من `companyId` للسجل المُشار إليه قبل الاستخدام) لأن الـFK
وحده لا يمنع الإشارة إلى صف من منشأة أخرى.

**استراتيجية التزامن** (Concurrency): `stock_levels` لا يُكتب إليه مباشرة إلا
عبر `InventoryService.recordMovement()`، الذي يستخدم:
1. `INSERT ... ON CONFLICT (company_id, warehouse_id, product_id) DO NOTHING`
   خام لإنشاء الصف أول مرة بأمان تحت التزامن (upsert العادي لـPrisma **ليس**
   ذريًا ضد upsert متزامن على نفس المفتاح في Postgres).
2. `UPDATE stock_levels SET quantity_on_hand = quantity_on_hand + $delta
   WHERE ... AND quantity_on_hand + $delta >= 0` — تحديث ذري واحد يمنع الرصيد
   السالب ضمن نفس الجملة، دون فجوة قراءة-ثم-كتابة يمكن استغلالها. مُختبَر
   صراحة بإرسال 10 طلبات تسوية متزامنة والتحقق من أن النتيجة النهائية صحيحة
   رياضيًا (`test/phase2.e2e-spec.ts` "Concurrency").

**التحويل بين المستودعات**: عملية واحدة الخطوة (ذرّية ضمن معاملة واحدة) تُنشئ
حركتي `transfer_out`/`transfer_in` مرتبطتين بـ`reference_id` مشترك. نموذج
تحويل "قيد النقل" متعدد المراحل (شحن ثم استلام) مؤجَّل لمرحلة لاحقة، وموثَّق
هنا كتحسين مستقبلي وليس نسيانًا.

## 3. Parties (المرحلة 2 — منفَّذ)

```text
customers    الاسم، الجوال، البريد، العنوان، الرقم الضريبي، مرجع (فريد لكل
             منشأة)، ملاحظات، isActive
suppliers    الاسم، جهة الاتصال، الجوال، البريد، العنوان، الرقم الضريبي،
             مرجع (فريد لكل منشأة)، ملاحظات، isActive
```
تصميم بجدولين منفصلين (وليس Party موحّد) لأن نشاط بقالة/سوبرماركت لا يحتاج
عادةً كيانًا واحدًا يعمل كعميل ومورد معًا؛ الفصل أبسط وأوضح للتاجر.

**رقم الجوال ليس فريدًا** (لا على مستوى المنشأة ولا عالميًا) — عملاء حقيقيون
قد يتشاركون رقمًا (أسرة واحدة)، والتاجر قد يُدخل بيانات ناقصة لعميل عابر؛
`reference` (رقم مرجعي اختياري يُدخله التاجر) هو الحقل الفريد لكل منشأة إن
استُخدم، مُختبَر صراحة أن نفس الرقم المرجعي مسموح في منشأتين مختلفتين.
حد الائتمان والرصيد (ذمم مدينة/دائنة) مؤجَّلان لمرحلة المحاسبة (4) حيث
تُبنى الذمم من حركات فعلية (مبيعات آجلة، مدفوعات) وليس كحقل ثابت الآن.

## 4. Sales / POS (المرحلة 3 — منفَّذ، بنطاق أضيق مما خُطِّط له أصلًا هنا)

```text
sales               عملية بيع مكتملة (company_id, branch_id [مُشتق من
                    warehouse_id, ليس من العميل], warehouse_id, pos_device_id
                    اختياري, customer_id اختياري, status
                    (completed/cancelled), currency, subtotal,
                    discount_amount, tax_amount, total_amount,
                    client_reference_id [فريد لكل منشأة — مفتاح idempotency]،
                    actor_membership_id, cancelled_at)
sale_items          بند بيع، Snapshot كامل وقت البيع (product_id + product_name
                    + product_sku + unit_price + vat_rate منسوخة، بحيث لا
                    يتأثر سطر بيع تاريخي بتعديل لاحق على المنتج)
payments            دفعة على عملية بيع (تدعم Split — عدة صفوف لكل sale)،
                    method: cash | card | transfer | other | external،
                    status: pending | success | failed | cancelled | refunded،
                    provider_key + external_reference + idempotency_key
                    (فارغة إلا عند method = external)
invoice_sequences    عدّاد فاتورة ذرّي لكل منشأة (company_id هو PK نفسه)،
                    next_number — يُستهلَك عبر UPDATE محروس ذرّي، نفس نمط
                    stock_levels
invoices            فاتورة صادرة لعملية بيع واحدة (unique على sale_id)،
                    invoice_number (فريد لكل منشأة)، نسخة من نفس المبالغ
                    المالية للبيع وقت الإصدار، status (issued/cancelled)
```

**انحراف موثَّق عن التصميم الأصلي لهذا القسم** (كان مكتوبًا في المرحلة 1 قبل
بناء أي كود Sales فعليًا): التصميم الأصلي افترض `sale_returns`/
`sale_return_items` (نظام مرتجعات كامل)، `held_carts` (سلات معلّقة محفوظة في
قاعدة البيانات)، و`cash_sessions`/`cash_movements` (ورديات كاشير). **لم تُبنَ
هذه الجداول في المرحلة 3** — قرار مقصود موثَّق في `docs/PROJECT_STATUS.md`
"Deferred": نطاق Phase 3 المُتفَق عليه فعليًا هو POS + Sales + Payments +
Invoices + أساس التكامل، وليس نظام ورديات/مرتجعات كاملًا. `sales.status` يدعم
فقط `completed`/`cancelled` (إلغاء كامل للفاتورة، وليس مرتجع جزئي بالسطر) —
كافٍ لعدم "تجميد" التصميم ضد إضافة مرتجعات لاحقًا (`docs/SALES.md` "Deferred:
partial returns")، دون بناء ما لم يُطلَب بعد.

**انحراف موثَّق آخر — عمود `payments.method`**: التصميم الأصلي هنا اقترح ألا
يكون `method` عمود enum ثابتًا، بل `integration_connection_id` اختياريًا بدلًا
منه. عمليًا، `method` بقي **enum ثابتًا** (`cash | card | transfer | other |
external`) لأن القيم المحلية الأربع لا تحتاج ربطًا بأي تكامل خارجي إطلاقًا،
والقيمة الخامسة العامة `external` (بلا أي اسم مزوّد مُدمَج) هي الوحيدة التي
تفعّل عمودي `provider_key`/`external_reference` الاختياريين. هذا يحافظ على
نفس المبدأ (لا اسم قيّدها أو أي مزوّد آخر مكتوب في الـSchema) بتصميم أبسط
يناسب أن المرحلة 3 لا تحتوي Adapter خارجي فعلي بعد — راجع `docs/PAYMENTS.md`.

**Idempotency**: `sales.client_reference_id` (فريد لكل `company_id`) هو مفتاح
Idempotency على مستوى عملية البيع الكاملة (وليس لكل دفعة) — طلب مكرر بنفس
المفتاح يُعيد نفس السجل بدل إنشاء بيع مكرر، حتى تحت تزامن حقيقي. تفاصيل
كاملة في `docs/SALES.md` "Idempotency".

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

## الحالة الحالية (منفّذ فعليًا في Prisma حتى نهاية المرحلة 3)

الجداول المنفَّذة في `backend/prisma/schema.prisma`:

**المرحلة 1**: `companies, branches, warehouses, pos_devices, users,
memberships, roles, permissions, role_permissions, membership_roles,
refresh_tokens, audit_logs, integration_providers, integration_connections,
webhook_events`

**المرحلة 2**: `units, product_categories, brands, products, product_barcodes,
stock_levels, stock_movements, stock_adjustments, stock_counts,
stock_count_lines, customers, suppliers`

**المرحلة 3**: `sales, sale_items, payments, invoice_sequences, invoices`

`integration_transactions` لا يزال مؤجَّلًا حتى وجود Adapter خارجي فعلي
يستهلكه — لم يُستهلَك في المرحلة 3 لأن الدفع المحلي (نقدي/بطاقة/تحويل) لا
يمر عبر `integrations` إطلاقًا (`docs/PAYMENTS.md`)، وتعريفه يبقى موثّقًا هنا
دون إضافته فارغًا بلا استخدام.

باقي الجداول (Purchasing, Accounting, Import, ZATCA) ستُضاف عبر Migrations
جديدة في مراحلها، وليس دفعة واحدة الآن.
