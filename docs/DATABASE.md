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
  - subscription_number (Phase 12): Int فريد، تسلسلي (autoincrement، يبدأ من
    10001) - مُعرِّف يمليه التاجر لفظيًا لتسجيل الدخول (owner) وتسجيل دخول
    الموظفين (employee-login)، مختلف عن id الداخلي (uuid). راجع
    DOMAIN_MODEL.md "رقم الاشتراك ودخول الموظف".

branches              فرع تابع لمنشأة
  - company_id, name, code, address, is_default

warehouses            مستودع تابع لفرع (قد يكون أكثر من مستودع للفرع الواحد)
  - company_id, branch_id, name, code, is_default

pos_devices            جهاز نقطة بيع مسجَّل
  - company_id, branch_id, name, device_code, status

users                 هوية عالمية - لا تحمل company_id ولا تخضع لـRLS إطلاقًا
  - full_name, email (فريد عالميًا), mobile (فريد عالميًا), password_hash,
    status, locale
  - home_company_id (Phase 12، nullable): مضبوط فقط لحسابات username (فِرَق
    نقطة البيع/المحاسبة) - المنشأة الوحيدة التي ينتمي لها هذا الحساب.
    username أصبح فريدًا ضمن (home_company_id, username) بدل عالميًا -
    NULL لحسابات البريد/الجوال (تبقى هوية عالمية كما كانت).

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
                        لحجز POS في المرحلة 3)، وaverage_cost
                        (Decimal(14,4)، Milestone 6 — متوسط التكلفة المرجّح
                        المتحرك، يُكتب فقط ضمن نفس UPDATE الذرّي الذي يكتب
                        quantity_on_hand، راجع docs/ACCOUNTING.md "COGS /
                        تقييم المخزون")
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
                    يتأثر سطر بيع تاريخي بتعديل لاحق على المنتج)، وunit_cost
                    (Decimal(14,4)? قابل لأن يكون NULL، Milestone 6 — تكلفة
                    الوحدة من محرّك التقييم وقت البيع نفسه، تُستخدَم عند
                    الإلغاء لإعادة المخزون بنفس التكلفة الأصلية بدل المتوسط
                    الحالي؛ NULL لأي سطر بيع سابق لهذه المرحلة)
payments            دفعة على عملية بيع (تدعم Split — عدة صفوف لكل sale)،
                    method: cash | card | transfer | other | external،
                    status: pending | success | failed | cancelled | refunded،
                    provider_key + external_reference + idempotency_key
                    (فارغة إلا عند method = external)، client_reference_id?
                    (Milestone 7 - فريد لكل منشأة عبر @@unique([companyId,
                    clientReferenceId])، NULL لصفوف الدفع المُنشأة وقت
                    إنشاء البيع نفسه [Postgres يسمح بـNULL متعددة]، يُملأ
                    فقط لدفعة آجلة لاحقة عبر POST /sales/:id/payments
                    لإعطائها Idempotency حقيقية)
invoice_sequences    عدّاد فاتورة ذرّي لكل منشأة (company_id هو PK نفسه)،
                    next_number — يُستهلَك عبر UPDATE محروس ذرّي، نفس نمط
                    stock_levels
invoices            فاتورة صادرة لعملية بيع واحدة (unique على sale_id)،
                    invoice_number (فريد لكل منشأة)، نسخة من نفس المبالغ
                    المالية للبيع وقت الإصدار، status (issued/cancelled)
sale_returns        (Milestone 7) مرتجع مبيعات جزئي/كلي على sale موجود -
                    company_id, branch_id, sale_id, reason?, subtotal,
                    tax_amount, total_amount, client_reference_id [فريد
                    لكل منشأة]، actor_membership_id. مُعرَّف بـUUID فقط
                    (بلا رقم تسلسلي بشري - سجل تصحيحي داخلي مثل
                    stock_adjustments، وليس مستندًا موجّهًا للعميل مثل
                    invoices)
sale_return_items   بند مرتجع، sale_item_id (السطر الأصلي)، quantity،
                    unit_price، vat_rate، unit_cost [Decimal(14,4)?،
                    منسوخ من SaleItem.unitCost وقت الإرجاع - يحافظ على
                    التكلفة التاريخية لعكس COGS]، line_subtotal/tax/total
                    (توزيع نسبي من قيم السطر الأصلي)
```

**انحراف موثَّق عن التصميم الأصلي لهذا القسم** (كان مكتوبًا في المرحلة 1 قبل
بناء أي كود Sales فعليًا): التصميم الأصلي افترض `held_carts` (سلات معلّقة
محفوظة في قاعدة البيانات) و`cash_sessions`/`cash_movements` (ورديات
كاشير). **لم تُبنَ هذه الجداول حتى الآن** — قرار مقصود موثَّق في
`docs/PROJECT_STATUS.md` "Deferred": نطاق Phase 3 المُتفَق عليه فعليًا هو
POS + Sales + Payments + Invoices + أساس التكامل، وليس نظام ورديات كاملًا.
`sale_returns`/`sale_return_items` المُقترَحان أصلًا هنا **بُنيا فعليًا في
Milestone 7** (راجع أعلاه) — `sales.status` نفسه لا يزال يدعم فقط
`completed`/`cancelled` (إلغاء كامل عبر `cancelSale`، آلية منفصلة تمامًا
عن مرتجعات السطر الجزئية الجديدة) — راجع `docs/SALES.md`/`docs/ACCOUNTING.md`
"مرتجعات المبيعات".

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

## 5. Purchasing (المرحلة 4 — منفَّذ، بنطاق أضيق مما خُطِّط له أصلًا هنا)

```text
purchases            أمر شراء/فاتورة مورد (company_id, branch_id [مُشتق من
                     warehouse_id، ليس مُدخلًا]، warehouse_id، supplier_id،
                     status (ordered/received/cancelled)، currency، subtotal،
                     discount_amount، tax_amount، total_amount،
                     reference_number (PUR-###### فريد لكل منشأة)،
                     client_reference_id [فريد لكل منشأة — idempotency]،
                     actor_membership_id، received_at، cancelled_at)
purchase_items       بند شراء، Snapshot كامل وقت الشراء (product_id +
                     product_name + product_sku + unit_cost + vat_rate
                     منسوخة — unit_cost تكلفة فعلية متفاوض عليها، وليست
                     product.cost_price)
purchase_sequences    عدّاد رقم مرجعي ذرّي لكل منشأة (company_id هو PK نفسه)،
                     نفس نمط invoice_sequences الذرّي بالضبط
supplier_payments    (Milestone 7) دفعة لمورد تُسدِّد purchase محدد -
                     purchase_id **إلزامي** (على عكس payments.sale_id
                     الاختياري ضمنيًا عبر الوجود دومًا - كل دفعة مورد
                     تخص فاتورة شراء واحدة محددة دائمًا)، supplier_id،
                     branch_id، method، amount، currency، reference?
                     (نص حر - مرجع بنكي/شيك)، client_reference_id [فريد
                     لكل منشأة - idempotency]، actor_membership_id
purchase_returns      (Milestone 7) مرتجع مشتريات جزئي/كلي على purchase
                     موجود - نفس بنية sale_returns تمامًا (company_id,
                     branch_id, purchase_id, reason?, subtotal, tax_amount,
                     total_amount, client_reference_id، UUID فقط بلا رقم
                     تسلسلي)
purchase_return_items بند مرتجع، purchase_item_id، quantity، unit_cost
                     [Decimal(14,2) غير قابل لـNULL دائمًا، على عكس
                     sale_return_items.unit_cost - تكلفة الشراء معروفة
                     دائمًا]، vat_rate، line_subtotal/tax/total
```

**انحراف موثَّق عن التصميم الأصلي لهذا القسم** (كان مكتوبًا قبل بناء أي
كود Purchasing فعليًا، ويفترض `purchase_orders`/`po_items` منفصلة عن
`goods_receipts`/`supplier_invoices`): التصميم الفعلي دمج هذه المفاهيم في
جدول واحد — **الشراء هو الفاتورة**، لا كيان `supplier_invoices` منفصل
(`docs/PURCHASING.md` "الشراء هو الفاتورة")، و`purchase.status` نفسه
(`ordered`→`received`) يعبّر عن دورة الاستلام بدل جدول `goods_receipts`
منفصل. `purchase_returns`/`purchase_return_items` و`supplier_payments`
المُقترَحان أصلًا هنا **بُنيا فعليًا في Milestone 7** — راجع
`docs/ACCOUNTING.md` "مرتجعات المشتريات"/"دفعات الموردين".

## 6. Expenses (المرحلة 4 — منفَّذ)

```text
expense_categories    فئة مصروف (company_id، name [فريد لكل منشأة]،
                      account_id [الحساب المحاسبي المرتبط — Account
                      Mapping]، is_active). قابلة للتوسيع، وليست قائمة
                      مغلقة — 6 فئات افتراضية تُزرَع عند التسجيل.
expenses             المبلغ، الفئة، الفرع (اختياري — مصروف على مستوى
                      المنشأة مسموح)، طريقة الدفع (نفس Enum
                      payments.method المحلي)، status (recorded/cancelled)،
                      client_reference_id [idempotency]
```

لا عمود مرفق/إيصال (Receipt attachment) في هذه المرحلة — راجع
`docs/EXPENSES.md` "ما لم يُبنَ بعد".

## 7. Accounting (المرحلة 4 — منفَّذ؛ مُكمَّل في Milestone 1: Accounting Completion)

```text
accounts              دليل الحسابات (شجري عبر self-relation parent_id:
                      أصول/خصوم/حقوق ملكية/إيرادات/مصروفات). code فريد لكل
                      منشأة — مفتاح البحث الثابت (Account Mapping)، وليس
                      UUID. type وcode غير قابلين للتعديل بعد الإنشاء.
journal_entries        قيد محاسبي. status: posted | reversed فقط — لا
                      draft (لا تدفق إدخال يدوي يبرره). reference_type/
                      reference_id يربطانه بمعاملته المصدر (Sale/Purchase/
                      Expense/OpeningBalance منذ Milestone 1؛
                      StockAdjustment/StockCount مُضافان في Milestone 7 -
                      Sale/Purchase أيضًا تُستخدَمان الآن لقيود دفعة/
                      مرتجع لاحقة على نفس البيع/الشراء الأصلي، لا بيع/شراء
                      جديد). reversal_of_entry_id يشير للقيد الأصلي عند
                      قيد عكسي. branch_id اختياري.
journal_lines           بنود القيد (مدين/دائن، حساب واحد لكل سطر) — يجب أن
                      يتوازن كل قيد (مدين = دائن، مُتحقَّق برمجيًا عند
                      الترحيل، وليس بقيد Check على مستوى قاعدة البيانات).
fiscal_periods          فترة مالية قابلة للإقفال (Milestone 1). id,
                      company_id, name, start_date DATE, end_date DATE,
                      status (open|closed، افتراضي open)، closed_at،
                      closed_by_membership_id. لا تُنشئ أي قيد ولا تلمس
                      أي قيد مُرحَّل — فقط تمنع JournalService من ترحيل/
                      عكس قيد جديد طالما "اليوم" يقع ضمن فترة closed
                      (لا Backdating في هذا النظام، فـ"اليوم" هو المعيار
                      الوحيد). راجع `docs/ACCOUNTING.md` "الفترات
                      المحاسبية".
```

**فهرس مفهرس**: `fiscal_periods_company_id_start_date_end_date_idx`
(`company_id, start_date, end_date`) و
`fiscal_periods_company_id_status_idx` (`company_id, status`).

**RLS**: `fiscal_periods` بنفس نمط `FORCE ROW LEVEL SECURITY` + policy
`tenant_isolation` المستقل لكل جدول تجاري في هذا النظام — بلا استثناء.

**حارس تزامن الرصيد الافتتاحي (Opening Balance)**: فهرس فريد جزئي إضافي
على `journal_entries` نفسها (وليس جدولًا جديدًا — الرصيد الافتتاحي مجرد
`JournalEntry` بـ`reference_type = 'OpeningBalance'`):

```sql
CREATE UNIQUE INDEX "journal_entries_one_active_opening_balance"
  ON "journal_entries" ("company_id")
  WHERE "reference_type" = 'OpeningBalance' AND "status" = 'posted'
        AND "reversal_of_entry_id" IS NULL;
```

يضمن وجود قيد رصيد افتتاحي "نشط" (مُرحَّل وليس عكسيًا) واحد فقط لكل
منشأة، حتى تحت سباق تزامن حقيقي — انتهاك القيد يُترجَم إلى `409` في
`OpeningBalanceService.create()`. راجع `docs/ACCOUNTING.md` "حارس
التزامن" للتفصيل الكامل، بما فيه علّة ترتيب كانت تنتهك هذا الفهرس
عابرًا أثناء `reverseJournalEntry` واكتُشفت وصُحِّحت في نفس الـMilestone.

**انحراف موثَّق عن التصميم الأصلي لهذا القسم**: التصميم الأصلي افترض
`fiscal_periods`/`opening_balances` كذلك. **لم يُبنَيا في المرحلة 4،
وبُنيا لاحقًا في Milestone 1** — `fiscal_periods` جدول مستقل كما أعلاه؛
الرصيد الافتتاحي **لم يُبنَ كجدول `opening_balances` منفصل كما افترض
التصميم الأصلي** — بل كـ`JournalEntry` عادي (راجع أعلاه)، لتفادي أي
آلية ترحيل موازية لنقطة العبور الوحيدة `JournalService.postJournalEntry`.
كذلك، لا `manual` كمصدر لقيد — كل قيد تلقائي حصرًا (`reference_type` من
ست قيم اليوم: `Sale`/`Purchase`/`Expense`/`OpeningBalance`/
`StockAdjustment`/`StockCount`، بالإضافة لقيد عكسي بنفس `reference_type`
الأصل).

**`bank_reconciliations` (Milestone 7)**: جدول واحد فقط، بلا جدول مطابقة
أسطر منفصل — id, company_id, branch_id?, account_code (رمز ثابت من
ACCOUNT_CODES، مثل account_id على expense_categories، وليس FK لصف
account محدد)، as_of_date DATE، statement_balance، book_balance (محسوب
من journal_lines وقت الإنشاء، غير قابل لإعادة الحساب لاحقًا)، difference،
notes?، actor_membership_id، created_at. الإنشاء = اكتمال فوري وغير قابل
للتعديل (كـ`audit_logs`) — لا حالة مسودة. راجع `docs/ACCOUNTING.md`
"التسوية البنكية/النقدية" لسبب عدم بناء مطابقة أسطر فردية.

**لا إدخال يدوي مزدوج — مُنفَّذ فعليًا، وليس مبدأً مؤجَّلًا بعد الآن**: كل
عملية تجارية (بيع، استلام شراء، مصروف) تُنشئ قيدها تلقائيًا عبر
`JournalService.postJournalEntry` — **لا `POST`/`PATCH`/`DELETE` على
`JournalEntry` في أي مكان بالـAPI**. راجع `docs/JOURNAL_ENTRIES.md`
للآلية الكاملة (بما فيها العكس عبر `reversalOfEntryId`، لا التعديل
المباشر).

## 8. Import (Milestone 3 — منفَّذ)

```text
import_jobs          ملف مرفوع، النوع (products/barcodes/categories/units/
                      customers/suppliers/opening_stock)، الحالة، مفتاح
                      التخزين، ربط الأعمدة (JSONB)، عدّادات الصفوف، أخطاء
                      التحقق (JSONB، محدودة العدد)، clientReferenceId
```

تبسيط عمدي عن التصميم الأولي المخطَّط أعلاه: **لا يوجد جدول `import_job_rows`
منفصل** — كل صف بيانات الملف يُعاد قراءته وتحقيقه من الملف المخزَّن عند
كل خطوة (Preview/Validate/Confirm)، بدل تخزين صف مستقل بقاعدة البيانات لكل
سطر Excel (قد يصل 5000 صف). النتيجة النهائية لكل صف (نجاح/خطأ) تُخزَّن على
`import_jobs.validation_errors` كمصفوفة JSON **محدودة العدد** (أول 500 خطأ
فقط - `MAX_STORED_VALIDATION_ERRORS`) للتدقيق، لا كل صف. لا أعمدة ثابتة
مفترضة لأي نوع بيانات — الربط (`column_mapping`) يُحفظ كـJSONB لأن أعمدة
ملفات Excel تختلف من تاجر لآخر، تمامًا كما كان مخطَّطًا. راجع
`docs/IMPORT_EXCEL.md` للتصميم الكامل (State machine، Validation، Idempotency،
File Storage).

ملفات Excel المرفوعة نفسها **لا تُخزَّن في قاعدة البيانات إطلاقًا** — فقط
مفتاح تخزين نصي (`import_jobs.file_key`، الصيغة
`imports/<companyId>/<jobId>/source.xlsx`، مُولَّد من الخادم دائمًا وليس
من اسم الملف الأصلي) يشير إلى ملف حقيقي عبر `StorageService`
(`backend/src/modules/storage`) — راجع `docs/IMPORT_EXCEL.md` "File Storage".

## 9. ZATCA (Milestone 4 — Phase 1 فقط منفَّذ)

```text
invoice_compliance     سجل امتثال منفصل، واحد لكل Invoice (1:1) - status
                       (فعليًا: not_submitted فقط اليوم)، qr_code (Base64
                       TLV، NULL إن لم يوجد رقم ضريبي للمنشأة)، generated_at
```

**منفَّذ فعليًا** (Milestone 4): جدول `invoice_compliance` بنفس نمط
`FORCE ROW LEVEL SECURITY` + `tenant_isolation` كأي جدول تجاري آخر
(migration `20260816140000_milestone4_zatca_readiness`)، علاقة 1:1 مع
`invoices` عبر `invoice_id` الفريد. **لا عمود hash/previous_invoice_hash/
CSID/signing metadata** أُضيف بعد — تُرِكت هذه عمدًا حتى حسم نطاق سلسلة
التجزئة (لكل جهاز/فرع/منشأة) وتوفر عقد ZATCA الفعلي، بدل تخمين أسماء/بنية
حقول ستبقى فارغة إلى أجل غير مسمى. تصميم مفصّل في `docs/ZATCA.md`.

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

> **تحديث Milestone 9**: الجدولان `integration_transactions` أعلاه (بالشكل
> العام الموصوف: `reference_type`/`request_payload`/`response_payload`)
> **لم يُبنَيا بهذا الشكل إطلاقًا** — راجع القسم التالي "Qeedha Integration
> (Inbound)" لما بُني فعليًا تحت اسم مشابه لكن بشكل مختلف تمامًا، ولماذا لا
> تعارض Schema حقيقي رغم تشارك الاسم.

## 10.1 Qeedha Integration — Inbound (Milestone 9 — منفَّذ)

اتجاه **مختلف** عن الجدول العام أعلاه — قيّدها (نظام خارجي) تستدعي Qeedha B،
لا العكس. راجع `docs/QEEDHA_INTEGRATION.md` §"تحديث Milestone 9" للتصميم
الكامل. يعيد استخدام `integration_connections`/`integration_providers`
الموجودين (أعمدة جديدة على الأول فقط، بلا تعديل الثاني):

```text
integration_connections      (أعمدة إضافية على الجدول الموجود، Inbound فقط)
  - public_reference UNIQUE (مرجع عام - "qic_" + 24 خانة hex - ليس id الصف)
  - secret_hash (SHA-256 - نفس hashToken لـ refresh_tokens)
  - secret_last_four (عرض آمن فقط)
  - system_membership_id -> memberships(id) (العميل النظامي، أنشئ كسولًا عند أول ربط)
  - revoked_at

integration_customer_mappings      خريطة مرجع عميل خارجي <-> Customer داخلي
  - company_id, connection_id, external_customer_reference, customer_id
  - UNIQUE(company_id, connection_id, external_customer_reference)
  - FORCE ROW LEVEL SECURITY + tenant_isolation policy

integration_transactions      سجل معاملات تسوية الدفعات الواردة من قيّدها
  - company_id, connection_id, branch_id, sale_id?, payment_id? (UNIQUE),
    customer_id?, external_transaction_id, idempotency_key,
    status (success/failed/cancelled - بلا pending حقيقي، بلا refunded),
    amount NUMERIC(14,2), currency_code, invoice_reference, branch_reference,
    failure_reason?, cancelled_at?
  - UNIQUE(company_id, connection_id, idempotency_key)
  - INDEX(company_id, connection_id, external_transaction_id)
  - FORCE ROW LEVEL SECURITY + tenant_isolation policy
```

`invoice_reference`/`branch_reference` **ليسا** جداول Mapping جديدة — يُحلان
مباشرة عبر `Invoice.invoiceNumber`/`Branch.code` الموجودين أصلًا (مرجعان
خارجيان آمنان بالفعل، لا حاجة لطبقة إضافية). `payment_id` فريد (`@unique`)
لأن كل معاملة ناجحة تنتج صف `Payment` واحدًا بالضبط عبر
`SalesService.recordExternalPayment` — لا علاقة عكسية متعددة ممكنة.

**Migration**: `20260818000000_milestone9_qeedha_integration` — RLS مُضافة
يدويًا في نفس ملف الـmigration (نفس نمط كل جدول تجاري سابق). لا تعديل على
أي جدول من مرحلة سابقة عدا الأعمدة المذكورة أعلاه على `integration_connections`.

---

## الحالة الحالية (منفّذ فعليًا في Prisma حتى Milestone 4)

الجداول المنفَّذة في `backend/prisma/schema.prisma`:

**المرحلة 1**: `companies, branches, warehouses, pos_devices, users,
memberships, roles, permissions, role_permissions, membership_roles,
refresh_tokens, audit_logs, integration_providers, integration_connections,
webhook_events`

**المرحلة 2**: `units, product_categories, brands, products, product_barcodes,
stock_levels, stock_movements, stock_adjustments, stock_counts,
stock_count_lines, customers, suppliers`

**المرحلة 3**: `sales, sale_items, payments, invoice_sequences, invoices`

**المرحلة 4**: `purchases, purchase_items, purchase_sequences,
expense_categories, expenses, accounts, journal_entries, journal_lines` —
8 جداول جديدة، كل جدول بـ`FORCE ROW LEVEL SECURITY` + policy
`tenant_isolation` مستقل (`prisma/migrations/
20260815200000_phase4_purchasing_expenses_accounting/`). لا تعديل على أي
جدول من المراحل السابقة.

**Milestone 1 (Accounting Completion)**: جدول جديد واحد فقط —
`fiscal_periods` (نفس نمط `FORCE ROW LEVEL SECURITY` + `tenant_isolation`،
migration `20260815220000_milestone1_accounting_completion`) — بالإضافة
لفهرس فريد جزئي جديد على `journal_entries` الموجود أصلًا
(`journal_entries_one_active_opening_balance`، migration
`20260815223000_milestone1_opening_balance_concurrency_guard`). لا جدول
جديد آخر: التقارير المالية وSubledger الذمم وطبقة الأرصدة الافتتاحية
كلها تقرأ/تكتب عبر `journal_entries`/`journal_lines` الموجودتين أصلًا،
بلا أي حالة مخزَّنة موازية. لا تعديل على أي جدول من المراحل السابقة.

**Milestone 3 (Excel Import)**: جدول جديد واحد فقط — `import_jobs` (نفس
نمط `FORCE ROW LEVEL SECURITY` + `tenant_isolation`، migration
`20260816120000_milestone3_excel_import`). لا جدول `import_job_rows`
منفصل (راجع القسم 8 أعلاه للسبب). لا تعديل على أي جدول من المراحل
السابقة، ولا تعديل على `Product`/`Customer`/`Supplier`/`StockMovement`
وغيرها من الجداول التي يكتب إليها الاستيراد — الكتابة تمر حصرًا عبر
الخدمات الموجودة أصلًا (`ProductsService.create`،
`InventoryService.setOpeningBalance`، ...).

**Milestone 4 (ZATCA E-Invoicing Readiness — Phase 1 فقط)**: جدول جديد
واحد فقط — `invoice_compliance` (نفس نمط RLS، migration
`20260816140000_milestone4_zatca_readiness`، علاقة 1:1 مع `invoices`).
لا عمود جديد على `invoices` نفسه أو أي جدول آخر. راجع القسم 9 أعلاه
و`docs/ZATCA.md` للتفصيل الكامل، خصوصًا "ما لم يُنفَّذ، ولماذا".

`integration_transactions` لا يزال مؤجَّلًا حتى وجود Adapter خارجي فعلي
يستهلكه — لم يُستهلَك بعد لأن الدفع المحلي (نقدي/بطاقة/تحويل) لا يمر عبر
`integrations` إطلاقًا (`docs/PAYMENTS.md`)، وتعريفه يبقى موثّقًا هنا دون
إضافته فارغًا بلا استخدام.

**Milestone 2 (Production Hardening + Demo/Staging Readiness)**: **لا
تغييرات على المخطط إطلاقًا** — لا Migration جديدة، لا جدول جديد، لا عمود
جديد. كل عمل هذا الـMilestone (CORS، Health check، Logging، Docker، CI،
اختبارات، بذر بيانات تجريبية) بنية تحتية/تشغيلية بحتة فوق نفس المخطط
الموجود من نهاية Milestone 1.

**Milestone 6 (Weighted-Average Inventory Valuation & COGS)**: **لا جدول
جديد** — فقط عمودان جديدان على جدولين موجودين (`stock_levels.average_cost`
Decimal(14,4)، `sale_items.unit_cost` Decimal(14,4)?، migration
`20260816150000_milestone6_weighted_average_cogs`). راجع الأقسام 2/4
أعلاه.

**Milestone 7 (Merchant Operations & Business Completion)**: 6 جداول
جديدة — `supplier_payments, sale_returns, sale_return_items,
purchase_returns, purchase_return_items, bank_reconciliations` (كلها
`FORCE ROW LEVEL SECURITY` + policy `tenant_isolation` مستقل، migration
`20260817000000_milestone7_merchant_operations`) — بالإضافة لعمود واحد
جديد على جدول موجود (`payments.client_reference_id`، اختياري، فريد لكل
منشأة عبر `@@unique([companyId, clientReferenceId])`)، وثلاثة صفوف جديدة
في `accounts` تُزرَع لكل منشأة (جديدة تلقائيًا، وقديمة عبر بيانات Backfill
idempotent ضمن نفس الـmigration — راجع `docs/ACCOUNTING.md` "الحسابات
الجديدة في دليل الحسابات"). لا تعديل على أي جدول/عمود آخر من المراحل
السابقة، ولا حذف بيانات بأي شكل.

**Milestone 8 (SaaS / Subscription & Billing)**: جدولان جديدان، migration
واحدة (`20260817010000_milestone8_saas_subscription`):

- **`plans`**: كتالوج عام، **بلا `company_id`، بلا RLS** — نفس معاملة
  `permissions`/`integration_providers` الموجودتين سلفًا (كل تحديد
  إضافي غير مطلوب لأن الصلاحية للقراءة فقط ومطلوبة لكل مستأجر على حدٍّ
  سواء). أعمدة: `code` (فريد)، `name`، `description`، `is_active`،
  `trial_eligible`، `price_monthly_sar` (`Decimal(10,2)?`، placeholder
  صريح)، `billing_interval`، `max_users`/`max_branches`/
  `max_monthly_sales` (`Int?`، `null` = بلا حد)، `features` (`Jsonb`).
- **`subscriptions`**: tenant-scoped، `FORCE ROW LEVEL SECURITY` +
  policy `tenant_isolation` (نفس النمط المعتاد). `company_id` **فريد**
  (`@@unique`، سطر واحد بالضبط لكل منشأة — لا `@@index` عادي). فهرسان
  إضافيان: `status` (بحث/تجميع مستقبلي لمركز تحكم)، `plan_id` (JOIN).
  أعمدة: `status` (`SubscriptionStatus` enum)، `trial_ends_at`،
  `current_period_start/end`، `cancelled_at`.

لا عمود جديد على `companies` — العلاقة العكسية `Company.subscription`
فقط، `CompanyStatus` الموجود لم يتغيّر. لا حذف بيانات، لا drift على أي
جدول من المراحل السابقة. لا Backfill مباشر في SQL الـmigration نفسها
(راجع `docs/DOMAIN_MODEL.md` "Milestone 8" "لماذا لا Backfill في
الـmigration" للسبب الدقيق المرتبط بـRLS) — أي منشأة قديمة بلا سطر
اشتراك تحصل عليه بشكل كسول عند أول طلب مصادَق بعد النشر.

**Milestone 9 (Qeedha Integration — Inbound)**: جدولان جديدان +
أعمدة إضافية على جدول موجود، migration واحدة
(`20260818000000_milestone9_qeedha_integration`) — راجع القسم 10.1 أعلاه
للتفصيل الكامل:

- `integration_connections`: 5 أعمدة جديدة (`public_reference` UNIQUE،
  `secret_hash`، `secret_last_four`، `system_membership_id`، `revoked_at`)
  — بلا حذف/تعديل أي عمود موجود.
- **`integration_customer_mappings`** (جديد): `FORCE ROW LEVEL SECURITY`
  + `tenant_isolation`.
- **`integration_transactions`** (جديد — **ليس** الجدول العام الموصوف في
  القسم 10 الأصلي، راجع ملاحظة التسمية أعلاه): `FORCE ROW LEVEL SECURITY`
  + `tenant_isolation`.

لا تعديل على `sales`/`payments`/`invoices`/`customers`/`branches` —
القيم الخارجية (`invoiceReference`/`branchReference`) تُقرأ من أعمدة
موجودة أصلًا (`invoiceNumber`/`code`) بلا أي عمود جديد عليها.
`Payment.method = 'external'` (قيمة Enum محجوزة منذ Phase 1) و
`Payment.providerKey`/`externalReference`/`idempotencyKey` (أعمدة موجودة
منذ Milestone 7، لم تُكتَب فعليًا من قبل) هي أول استخدام حقيقي لها.
