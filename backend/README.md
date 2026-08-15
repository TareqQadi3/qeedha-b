# Qeedha Accounting - Backend (Phase 1)

النظام المحاسبي وPOS للبقالات والسوبرماركت - المرحلة الأولى فقط
(Architecture + Domain Model + Database + Auth + RBAC + Audit Log +
Integration Layer skeleton). راجع `/docs` في جذر المستودع للتصميم الكامل.

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

# 3) دور "auth lookup" (يحتاج صلاحية Superuser - انظر التعليق أعلى الملف)
#    مع docker-compose، المستخدم qeedha_dev هو superuser داخل الحاوية:
psql "postgresql://qeedha_dev:qeedha_dev_pw@localhost:5432/qeedha_accounting" \
  -f prisma/manual-sql/001_auth_lookup_role.sql

# 4) بذر الصلاحيات والأدوار النظامية
npm run prisma:seed

# 5) التشغيل
npm run start:dev
```

الـAPI يعمل على `http://localhost:3000/api/v1`. جرّب:
`GET /api/v1/health`.

## لماذا يوجد دوران لقاعدة البيانات (roles)؟

`qeedha_dev`: الدور الرئيسي للتطبيق، خاضع لـRow-Level Security بالكامل
(`FORCE ROW LEVEL SECURITY` على كل جدول tenant-owned).

`qeedha_auth_lookup`: دور ثانٍ ضيق جدًا (`BYPASSRLS`، `SELECT` على أعمدة
محددة فقط من جدول `users`)، يُستخدم حصرًا لحل مشكلة "من هو المستخدم؟" أثناء
تسجيل الدخول قبل معرفة الـtenant. التفاصيل والمبرر الكامل في
`docs/SECURITY.md` وتعليقات `src/common/prisma/auth-lookup-prisma.service.ts`.

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
  -c "GRANT USAGE ON SCHEMA public TO qeedha_auth_lookup; GRANT SELECT (id, company_id, password_hash, status, full_name, locale, email, mobile, deleted_at) ON users TO qeedha_auth_lookup;"
DATABASE_URL="postgresql://qeedha_dev:qeedha_dev_pw@localhost:5432/qeedha_accounting_test?schema=public" npm run prisma:seed

# التشغيل
npm run test:e2e
```

راجع `docs/TESTING.md` لما تغطيه مجموعة اختبارات كل مرحلة.

## بنية المشروع

راجع `docs/ARCHITECTURE.md` §3. باختصار: `src/common` (البنية التحتية
المشتركة: Prisma، Guards، Decorators)، `src/modules/*` (كل وحدة أعمال بحدودها
الخاصة)، `prisma/schema.prisma` (نموذج البيانات المُنفَّذ فعليًا لهذه
المرحلة - النموذج الكامل موثّق في `docs/DATABASE.md`).
