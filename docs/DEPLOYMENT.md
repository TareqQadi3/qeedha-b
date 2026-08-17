# النشر (Deployment)

هذا الملف يوثّق كيفية تشغيل Qeedha Accounting محليًا (رابط)، وكيفية
بنائه/تشغيله عبر Docker + `docker-compose.yml` الجذري (Milestone 2)،
ومرجع متغيرات البيئة، وسكربت بذر بيانات تجريبية، وإعادة تصفير قاعدة
بيانات تجريبية، وإرشادات نسخ احتياطي/استعادة بسيطة لـPostgres.

**اقرأ قسم "القيود المعروفة" في الأسفل قبل أي شيء آخر** — Docker وCI في
هذا المستودع **جاهزان لكن غير مُختبَرين فعليًا بعد**، ولا يوجد نشر
Demo/Staging فعلي حتى الآن.

## 1) التشغيل المحلي (dev)

راجع الدليلين المخصصين لكل جزء — لا تكرار هنا:
- `backend/README.md` (Node.js 20+, Postgres 16, migrations, بذر
  الأدوار/الصلاحيات، تشغيل `npm run start:dev`).
- `frontend/README.md` (Vite dev server، يتطلب backend يعمل على
  `http://localhost:3000`).

## 2) البناء والتشغيل عبر Docker + `docker-compose.yml` الجذري

**ملاحظة هامة قبل البدء**: هذا التسلسل **لم يُنفَّذ فعليًا** في بيئة
التطوير التي كُتب فيها هذا الملف (لا Docker daemon متاح هناك). هو
التسلسل الصحيح المتوقَّع بناءً على محتوى `docker-compose.yml`،
`backend/Dockerfile`، و`frontend/Dockerfile` كما هي مكتوبة فعليًا — راجع
"القيود المعروفة" أدناه.

### أ) تعبئة ملفات البيئة

يوجد **ملفان منفصلان لا يتزامنان تلقائيًا** — يجب إبقاؤهما متّسقين
يدويًا عند النشر:

1. **`.env` في جذر المستودع** (يقرأه `docker-compose.yml` فقط، لخدمة
   `postgres` وبناء `frontend`):
   ```bash
   cp .env.example .env
   # عدّل POSTGRES_PASSWORD إلى قيمة حقيقية
   # عدّل VITE_API_BASE_URL إلى الرابط العام الفعلي للـbackend المنشور
   ```
2. **`backend/.env`** (يقرأه container الـbackend عبر `env_file` في
   compose): يجب أن يحتوي `DATABASE_URL`/`AUTH_LOOKUP_DATABASE_URL`
   بنفس بيانات اعتماد Postgres التي وضعتها في الملف الجذري أعلاه —
   خدمة `postgres` في compose تستخدم `POSTGRES_USER: qeedha_app` ثابتًا؛
   تأكد أن `DATABASE_URL` في `backend/.env` يطابق هذا الاسم وكلمة المرور
   نفسها من `.env` الجذري (وإلا فشل اتصال الـbackend بقاعدة البيانات).
   راجع `backend/.env.example` لبقية المتغيرات المطلوبة.

### ب) البناء

```bash
docker compose build
```

### ج) تشغيل Postgres أولًا، ثم الـMigrations/الأدوار/البذر (خطوات صريحة، لا تلقائية)

```bash
docker compose up -d postgres
# انتظر healthcheck (pg_isready) — docker compose ps يُظهر "healthy"

# الـMigrations لا تُشغَّل تلقائيًا عند بدء أي حاوية (قرار متعمَّد — راجع
# التعليق أعلى CMD في backend/Dockerfile) — خطوة يدوية صريحة دائمًا:
docker compose run --rm backend npx prisma migrate deploy

# دور "auth lookup" الضيق (نفس السكربتين المستخدمين محليًا):
docker compose run --rm backend sh -c \
  "psql \$DATABASE_URL -f prisma/manual-sql/001_auth_lookup_role.sql && \
   psql \$DATABASE_URL -f prisma/manual-sql/002_auth_lookup_role_update.sql"

# بذر الصلاحيات/الأدوار النظامية:
docker compose run --rm backend npm run prisma:seed
```

### د) تشغيل backend + frontend

```bash
docker compose up -d backend frontend
```

الـbackend على `http://localhost:3000/api/v1` (جرّب `GET /health`)،
الواجهة الأمامية على `http://localhost:8080` (منفذ nginx في compose).

**استيراد من Excel (Milestone 3)**: ملفات الاستيراد المرفوعة تُخزَّن على
القرص المحلي لحاوية الـbackend (`STORAGE_LOCAL_DIR`، افتراضي
`./storage-data`) — **غير مُضاف كـvolume دائم في `docker-compose.yml`
الجذري بعد**، فستُفقَد عند إعادة إنشاء الحاوية (وليس عند إعادة تشغيلها
فقط). مقبول لتجربة Demo (الملفات نفسها غير مطلوبة بعد اكتمال الاستيراد
فعليًا)؛ نشر حقيقي طويل الأمد يحتاج `volume` مخصصًا لهذا المسار أو التحول
لمزوّد S3-compatible (راجع `docs/IMPORT_EXCEL.md` §1).

## 3) مرجع متغيرات البيئة

لا تكرار لتوثيق كل متغيّر هنا — كل متغيّر موثَّق بتعليق مباشر فوقه في
ملفه:
- `backend/.env.example` — كل متغيرات الـbackend (قاعدة البيانات، أسرار
  JWT، `CORS_ALLOWED_ORIGINS`، مفتاح تشفير التكاملات).
- `frontend/.env.example` — `VITE_API_BASE_URL` (وقت التشغيل محليًا عبر
  `vite dev`؛ عبر Docker يُضمَّن وقت البناء بدلًا من ذلك — راجع (2) أعلاه).
- `.env.example` (جذر المستودع) — `POSTGRES_PASSWORD` و
  `VITE_API_BASE_URL` لـ`docker-compose.yml` فقط.

**تذكير أمني**: `CORS_ALLOWED_ORIGINS` **إلزامي** في `NODE_ENV=production`
— التطبيق يرفض الإقلاع بدونه (راجع `docs/SECURITY.md` "CORS"). لا تنشر
بدون تعيينه لقائمة origins الواجهة الأمامية الفعلية.

## 4) تشغيل سكربت بذر بيانات تجريبية (Demo Seed)

راجع `docs/DEMO.md` للتفصيل الكامل. باختصار، ضد أي backend يعمل ومُهاجَر
ومزروع (محلي أو عبر compose):

```bash
BASE_URL=http://localhost:3000/api/v1 npx ts-node scripts/demo-seed.ts
# أو: npm run demo:seed  (يستخدم BASE_URL الافتراضي http://localhost:3000/api/v1)
```

## 5) إعادة تصفير قاعدة بيانات تجريبية (Reset)

نفس نمط تصفير قاعدة الاختبار الموثَّق في `backend/README.md` قسم
"الاختبارات"، مُطبَّق على قاعدة Demo بدل قاعدة الاختبار:

```bash
dropdb qeedha_accounting_demo --if-exists
createdb qeedha_accounting_demo -O qeedha_app   # أو مستخدم DB المناسب لبيئتك

DATABASE_URL="postgresql://.../qeedha_accounting_demo?schema=public" \
  npx prisma migrate deploy

psql "postgresql://.../qeedha_accounting_demo" \
  -f prisma/manual-sql/001_auth_lookup_role.sql
psql "postgresql://.../qeedha_accounting_demo" \
  -f prisma/manual-sql/002_auth_lookup_role_update.sql

DATABASE_URL="postgresql://.../qeedha_accounting_demo?schema=public" \
  npm run prisma:seed

BASE_URL=http://localhost:3000/api/v1 npm run demo:seed   # اختياري، لبيانات تجريبية جاهزة
```

## 6) نسخ احتياطي/استعادة لـPostgres (بسيط، وليس نظام Backup كامل)

توثيق واضح لتسلسل قياسي، لا آلية أتمتة معقدة (خارج نطاق هذا الـMilestone
عمدًا):

**نسخ احتياطي**:
```bash
pg_dump -h localhost -U qeedha_app -d qeedha_accounting -F c -f backup.dump
```

**استعادة** (على قاعدة فارغة أو جديدة):
```bash
createdb qeedha_accounting_restored -O qeedha_app
pg_restore -h localhost -U qeedha_app -d qeedha_accounting_restored backup.dump
```

جدولة تلقائية (`cron`/`pg_cron`)، تشفير النسخة، ورفعها لتخزين خارجي كلها
خارج نطاق هذا الـMilestone — يبقى هذا التسلسل اليدوي كافيًا لـDemo/Staging.

## القيود المعروفة (Known Limitations) — اقرأ هذا قبل الاعتماد على أي شيء أعلاه

- **`docker build`/`docker compose up` لم يُنفَّذا فعليًا في أي جلسة
  تطوير حتى الآن**: بيئة التطوير التي كُتبت فيها Dockerfiles وملف
  compose لا تملك daemon Docker يعمل (`dockerd` يفشل بـ"Operation not
  permitted" عند `ulimit`، مُتحقَّق منه صراحة)، ولا صلاحية لتشغيله. كل
  ملف كُتب بعناية باتّباع أنماط Docker معروفة وموثَّقة، لكن هذا **لا
  يعادل تشغيلًا فعليًا مُتحقَّقًا منه** — قد تظهر أخطاء بناء/تشغيل غير
  متوقَّعة عند أول تنفيذ حقيقي.
- **CI (`​.github/workflows/ci.yml`) لم يُشغَّل فعليًا على أي GitHub
  Actions runner حقيقي**: التحقق الوحيد الذي جرى هو تحقق صحة نحوية
  (`python3 -c "import yaml; yaml.safe_load(...)"`). لا يُدَّعى أن CI
  "ينجح" — هو جاهز وصحيح نحويًا فقط، والتنفيذ الفعلي غير مُتحقَّق منه.
- **لا نشر Demo/Staging فعلي موجود اليوم**: لم يُنشر أي شيء على أي
  استضافة فعلية — لا حساب استضافة أو اعتمادات كانت متاحة في أي جلسة
  تطوير حتى الآن. كل ما هو موجود هو التهيئة الجاهزة الموثَّقة في هذا
  الملف (Dockerfiles، `docker-compose.yml`، CI) — وليس نشرًا فعليًا. لا
  تفترض وجود بيئة Demo/Staging تعمل فعليًا بناءً على وجود هذا التوثيق.

## Milestone 8 (SaaS / Subscription & Billing) — لا خطوة نشر جديدة

الـmigration الجديدة (`20260817010000_milestone8_saas_subscription`)
وبذور خطط الاشتراك (`DEFAULT_PLANS` في `prisma/seed.ts`) تُطبَّقان عبر
نفس الخطوتين الموجودتين أصلًا في القسم 2/ج أعلاه —
`prisma migrate deploy` ثم `npm run prisma:seed` — بلا أي دور DB إضافي،
بلا سكربت manual-sql جديد، وبلا متغيّر بيئة جديد. أي منشأة موجودة قبل
هذا الـMilestone تحصل على اشتراك تجريبي بشكل كسول عند أول طلب مصادَق
بعد النشر (راجع `docs/DOMAIN_MODEL.md` "Milestone 8") — لا خطوة يدوية
إضافية مطلوبة بعد النشر.
