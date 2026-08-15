# بنية الـ API

## معايير عامة

- REST، إصدار في المسار: `/api/v1/...`
- JSON فقط، `Content-Type: application/json`.
- المصادقة: `Authorization: Bearer <access_token>`.
- كل استجابة خطأ بصيغة موحّدة:
  ```json
  { "error": { "code": "STRING_CODE", "message": "...", "details": null } }
  ```
- Pagination موحّدة: `?page=1&pageSize=20` مع استجابة
  `{ "data": [...], "meta": { "page", "pageSize", "total" } }`.
- كل Endpoint يعلن الصلاحية المطلوبة صراحة عبر `@RequirePermissions()` — لا
  اعتماد ضمني على اسم المسار.
- `company_id`/`branch_id` تُشتق من الـJWT وسياق الطلب، لا تُقبل من Body/Query
  لتحديد نطاق الوصول (تُستخدم فقط لتحديد كيان مستهدف ضمن نطاق المستخدم نفسه).

## Endpoints المرحلة الأولى

### Auth (`/api/v1/auth`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| POST | `/register-company` | تسجيل منشأة جديدة + مستخدم Owner أول | عام (Rate-limited) |
| POST | `/login` | تسجيل دخول (email/mobile + password) | عام (Rate-limited) |
| POST | `/refresh` | تجديد access token عبر refresh token | يتطلب refresh token صالح |
| POST | `/logout` | إبطال refresh token الحالي | يتطلب مصادقة |
| GET | `/me` | بيانات المستخدم الحالي + صلاحياته الفعلية | يتطلب مصادقة |

### IAM (`/api/v1/iam`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/roles` | قائمة الأدوار المتاحة للمنشأة | `iam.roles.view` |
| GET | `/permissions` | قائمة الصلاحيات المتاحة في النظام | `iam.roles.view` |
| GET | `/users` | مستخدمو المنشأة | `iam.users.view` |
| POST | `/users` | إضافة مستخدم | `iam.users.manage` |
| POST | `/users/:id/roles` | إسناد دور لمستخدم (مع نطاق فرع اختياري) | `iam.users.manage` |
| DELETE | `/users/:id/roles/:userRoleId` | إلغاء إسناد دور | `iam.users.manage` |

### Tenancy (`/api/v1/tenancy`)
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET/POST | `/branches` | الفروع | `tenancy.branches.view` / `manage` |
| GET/POST | `/warehouses` | المستودعات | `tenancy.warehouses.view` / `manage` |
| GET/POST | `/pos-devices` | أجهزة نقاط البيع | `tenancy.pos_devices.view` / `manage` |

### Integrations (`/api/v1/integrations`) — بنية عامة فقط، بدون منطق قيّدها
| Method | Path | الوصف | صلاحية |
|---|---|---|---|
| GET | `/providers` | التكاملات المتاحة (metadata) | `settings.integrations.view` |
| GET | `/connections` | تكاملات المنشأة الحالية وحالاتها | `settings.integrations.view` |
| POST | `/connections/:providerKey/connect` | بدء ربط تكامل | `settings.integrations.manage` |
| POST | `/connections/:providerKey/disconnect` | فصل تكامل | `settings.integrations.manage` |
| POST | `/webhooks/:providerKey` | استقبال Webhook عام (توقيع يُتحقق منه لكل provider) | عام (موقّع) |

### Health
| Method | Path | الوصف |
|---|---|---|
| GET | `/api/v1/health` | فحص حالة الخدمة وقاعدة البيانات |

## Endpoints المراحل القادمة

تُضاف تدريجيًا: `/catalog`, `/inventory`, `/sales`, `/pos`, `/purchasing`,
`/expenses`, `/accounting`, `/reports`, `/import`, `/zatca` — كل منها يوثَّق
في ملف الوحدة الخاص بها عند البناء الفعلي، تجنبًا لتوثيق Endpoints غير موجودة.
