# الأمان (Security)

## المصادقة (Authentication)
- كلمات المرور: Argon2id (لا MD5/SHA عاري).
- JWT access token قصير الأجل (15 دقيقة افتراضيًا)، refresh token طويل الأجل
  (مثلًا 30 يومًا) **مع تدوير (rotation)**: كل استخدام لـrefresh يُصدر واحدًا
  جديدًا ويُبطل القديم؛ استخدام رمز مُبطَل سابقًا يُبطل السلسلة كاملة (إشارة
  سرقة محتملة).
- `refresh_tokens` يُخزَّن كـhash فقط، وليس القيمة الخام.
- Rate limiting على `/auth/login`, `/auth/register-company`, `/auth/refresh`.

## التفويض (Authorization)
- RBAC بثلاث طبقات (Role/Permission/Scope) — راجع `ARCHITECTURE.md` §6.
- فرض مزدوج: Guard قبل الوصول لأي Handler، وفلترة صريحة بمستوى الاستعلام.
- لا Endpoint بدون `@RequirePermissions(...)` صريح إلا ما هو معلن Public عمدًا
  (health check، تسجيل الدخول، تسجيل منشأة جديدة، webhook موقّع).

## عزل المستأجرين (Tenant Isolation)
- كل استعلام يمر عبر Prisma Middleware يحقن `company_id` تلقائيًا.
- Postgres RLS كخط دفاع مستقل عن كود التطبيق (`SET LOCAL app.tenant_id` لكل
  Request ضمن معاملة).
- لا مسار API يقبل `company_id` من العميل لتحديد نطاق البيانات — يُشتق من
  الجلسة فقط.

## حماية أسرار التكامل
- بيانات اعتماد أي `integration_connection` (رموز API، مفاتيح) تُشفَّر عند
  التخزين (encryption at rest) بمفتاح مُدار خارج قاعدة البيانات (متغير بيئة/
  Secret manager) — لا تُخزَّن نصًا صريحًا أبدًا.
- لا تُطبع أسرار التكامل أو التوكنات كاملة في الـLogs.

## Audit Log
راجع `ARCHITECTURE.md` §7 و`DATABASE.md` §1. يُسجَّل: من نفّذ، متى، أي فرع،
القيمة قبل/بعد عند الحاجة. لا Audit log قابل للتعديل أو الحذف من واجهة
التطبيق.

## بيانات حساسة أخرى
- لا تُسجَّل أرقام بطاقات كاملة، هويات وطنية، أو توكنات دفع في أي Log.
- تصدير التقارير المالية/الجماعي (bulk export) يتطلب صلاحية خاصة ويُسجَّل في
  Audit log.

## Rate Limiting عام
يُطبَّق على مستوى API Gateway/Middleware لكل الـEndpoints العامة، وبحدود أشد
على المسارات الحساسة (auth, webhooks, bulk export).

## هذا الملف حي
يُحدَّث مع كل مرحلة تُضيف سطح هجوم جديد (مثلًا: مرحلة ZATCA تضيف اعتبارات
تواقيع رقمية ومفاتيح تشفير خاصة بالهيئة، مرحلة Integration تضيف اعتبارات
Webhook signature verification لكل مزوّد).
