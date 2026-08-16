# Qeedha Accounting - Backend

النظام المحاسبي وPOS للبقالات والسوبرماركت. الأساس الحالي (قبل بدء المرحلة 2):
Architecture + Domain Model + Database + Auth/IAM (نموذج هوية
User/Tenant/Membership متعدد المنشآت) + RBAC + Audit Log + Integration Layer
skeleton. راجع `/docs` في جذر المستودع للتصميم الكامل، وخصوصًا
`docs/DOMAIN_MODEL.md`.

## المتطلبات

- Node.js 20+
- PostgreSQL 16 (محليًا أو عبر `docker-compose up -d`)

## الإعداد المحلي

```bash
npm install
cp .env.example .env   # عدّل القيم، خصوصًا الأسرار في الإنتاج

# 1) قاعدة البيانات
docker-compose up -d          # أو استخدم Postgres محلي بنفس بيانات .env

# 2) تطبيق الـMigrations
npx prisma migrate deploy

# 3) دور "auth lookup" (يحتاج صلاحية Superuser - انظر التعليق أعلى كل ملف)
#    مع docker-compose، المستخدم qeedha_dev هو superuser داخل الحاوية:
psql "postgresql://qeedha_dev:qeedha_dev_pw@localhost:5432/qeedha_accounting" \
  -f prisma/manual-sql/001_auth_lookup_role.sql
psql "postgresql://qeedha_dev:qeedha_dev_pw@localhost:5432/qeedha_accounting" \
  -f prisma/manual-sql/002_auth_lookup_role_update.sql

# 4) بذر الصلاحيات والأدوار النظامية
npm run prisma:seed

# 5) التشغيل
npm run start:dev
```

الـAPI يعمل على `http://localhost:3000/api/v1`. جرّب:
`GET /api/v1/health` (يُرجع `{status, timestamp, checks: {app,
database}}`، أو `503` إن فشل فحص قاعدة البيانات — راجع `docs/API.md`).

**تنبيه CORS (Milestone 2)**: في `NODE_ENV=production`،
`CORS_ALLOWED_ORIGINS` **إلزامي** — التطبيق يرفض الإقلاع بالكامل بدونه
(fail-closed، راجع `docs/SECURITY.md` "CORS"). في development/test هو
اختياري (افتراضي: منافذ Vite المحلية). راجع التعليق في `.env.example`.

كل طلب يُسجَّل بسطر JSON واحد (`requestId`, `method`, `path`, `status`,
`durationMs`) — لا رؤوس/query/body تصل إلى الـLog أبدًا، فلا سرّ يمكن أن
يتسرب إليه (راجع `docs/SECURITY.md` "Logging المهيكل").

**استيراد من Excel (Milestone 3)**: `STORAGE_DRIVER` (افتراضي `local`) و
`STORAGE_LOCAL_DIR` (افتراضي `./storage-data`، مجلد ملفات الاستيراد
المرفوعة — خارج git) اختياريان في `.env.example`. راجع
`docs/IMPORT_EXCEL.md` للتصميم الكامل.

## لماذا يوجد دوران لقاعدة البيانات (roles)؟

`qeedha_dev`: الدور الرئيسي للتطبيق، خاضع لـRow-Level Security بالكامل
(`FORCE ROW LEVEL SECURITY` على كل جدول tenant-owned).

`qeedha_auth_lookup`: دور ثانٍ ضيق جدًا (`BYPASSRLS`، `SELECT` على أعمدة
محددة فقط من `memberships`/`companies`)، يُستخدم حصرًا لتحديد المنشآت التي
يملك المستخدم عضوية فيها أثناء تسجيل الدخول قبل معرفة أي tenant context.
(`users` نفسها لم تعد بحاجة لهذا الدور إطلاقًا - غير محمية بـRLS من الأساس،
لأنها لم تعد بيانات tenant. راجع `docs/DOMAIN_MODEL.md`.) التفاصيل والمبرر
الكامل في `docs/SECURITY.md` وتعليقات
`src/common/prisma/auth-lookup-prisma.service.ts`.

**لا تمنح الدور الرئيسي `BYPASSRLS` أبدًا** - هذا يُبطل RLS كخط دفاع لكل
شيء آخر في النظام.

## الاختبارات

```bash
# قاعدة بيانات اختبار منفصلة (مرة واحدة):
createdb qeedha_accounting_test -O qeedha_dev
DATABASE_URL="postgresql://qeedha_dev:qeedha_dev_pw@localhost:5432/qeedha_accounting_test?schema=public" npx prisma migrate deploy
psql "postgresql://qeedha_dev:qeedha_dev_pw@localhost:5432/qeedha_accounting_test" \
  -c "GRANT CONNECT ON DATABASE qeedha_accounting_test TO qeedha_auth_lookup;"
psql "postgresql://qeedha_dev:qeedha_dev_pw@localhost:5432/qeedha_accounting_test" \
  -c "GRANT USAGE ON SCHEMA public TO qeedha_auth_lookup; GRANT SELECT (id, company_id, user_id, status) ON memberships TO qeedha_auth_lookup; GRANT SELECT (id, legal_name, trade_name, status) ON companies TO qeedha_auth_lookup;"
DATABASE_URL="postgresql://qeedha_dev:qeedha_dev_pw@localhost:5432/qeedha_accounting_test?schema=public" npm run prisma:seed

# التشغيل
npm run test:e2e
```

راجع `docs/TESTING.md` لما تغطيه مجموعة اختبارات كل مرحلة. **112/112**
تنجح حاليًا (`npx jest --config ./test/jest-e2e.json --runInBand`).

## Docker + النشر (Milestone 2)

`Dockerfile` (multi-stage، `node:20-slim`) و`.dockerignore` جاهزان لبناء
صورة إنتاج للـAPI فقط — لا قاعدة بيانات مُدمَجة، والـMigrations **لا**
تُشغَّل تلقائيًا عند بدء الحاوية (خطوة منفصلة صريحة دائمًا). للتسلسل
الكامل (بناء + `docker-compose.yml` الجذري + Postgres + الأدوار +
البذر) راجع `docs/DEPLOYMENT.md`.

**تنبيه صريح**: `docker build` لم يُختبَر فعليًا في بيئة التطوير (لا
Docker daemon متاح هناك) — راجع `docs/DEPLOYMENT.md` "القيود المعروفة"
قبل الاعتماد عليه دون تحقق.

## بيانات تجريبية (Demo Seed)

```bash
npm run demo:seed   # ضد backend يعمل ومهاجَر ومزروع، BASE_URL اختياري
```

يُنشئ منشأة تجريبية واحدة عبر Endpoints الحقيقية (منتجات/عملاء/موردين/
شراء مُستلَم/بيع POS مكتمل) — لا بيانات شخصية حقيقية، آمن لإعادة
التشغيل. راجع `docs/DEMO.md` للتفصيل الكامل.

## بنية المشروع

راجع `docs/ARCHITECTURE.md` §3. باختصار: `src/common` (البنية التحتية
المشتركة: Prisma، Guards، Decorators)، `src/modules/*` (كل وحدة أعمال بحدودها
الخاصة)، `prisma/schema.prisma` (نموذج البيانات المُنفَّذ فعليًا لهذه
المرحلة - النموذج الكامل موثّق في `docs/DATABASE.md`).
