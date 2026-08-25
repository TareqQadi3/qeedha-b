import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PLAN_CODES } from '../src/modules/subscriptions/constants/default-plans';

const unique = () => randomUUID().slice(0, 8);

const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_SEED_EMAIL!;
const ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_SEED_PASSWORD!;

/**
 * Phase 13: tiered subscription plans (البسيطة/الثانية/الثالثة/المؤسسات) with
 * exact per-role account limits, plus per-company overrides the platform
 * admin can set from the Control Center ("أخصص أي باقة من لوحة التحكم").
 */
describe('Phase 13: tiered plans + per-role limits + subscription overrides (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const adminLogin = async () => {
    const res = await request(server)
      .post('/api/v1/platform-admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  const registerTenant = async () => {
    const id = unique();
    const res = await request(server)
      .post('/api/v1/auth/register-company')
      .send({
        legalName: `متجر باقات ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `p13owner-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
      })
      .expect(201);

    const branches = await request(server)
      .get('/api/v1/tenancy/branches')
      .set(auth(res.body.accessToken))
      .expect(200);

    const roles = await request(server)
      .get('/api/v1/iam/roles')
      .set(auth(res.body.accessToken))
      .expect(200);

    return {
      id,
      accessToken: res.body.accessToken as string,
      companyId: res.body.company.id as string,
      branchId: branches.body.find((b: any) => b.isDefault).id as string,
      roleIdByName: Object.fromEntries(roles.body.map((r: any) => [r.name, r.id])) as Record<
        string,
        string
      >,
    };
  };

  type Tenant = Awaited<ReturnType<typeof registerTenant>>;

  const setPlan = (companyId: string, planCode: string) =>
    prisma.withTenant(companyId, async (tx) => {
      const plan = await tx.plan.findUniqueOrThrow({ where: { code: planCode } });
      return tx.subscription.update({ where: { companyId }, data: { planId: plan.id } });
    });

  /** POST /iam/users with a role - the normal way a merchant hires staff. */
  const hire = (
    tenant: Tenant,
    roleName: string,
    branchId?: string,
    opts: { expectStatus?: number } = {},
  ) =>
    request(server)
      .post('/api/v1/iam/users')
      .set(auth(tenant.accessToken))
      .send({
        fullName: `موظف ${unique()}`,
        email: `staff-${unique()}@test.qeedha.local`,
        password: 'StaffPass123',
        roleId: tenant.roleIdByName[roleName],
        branchId,
      })
      .expect(opts.expectStatus ?? 201);

  describe('كتالوج الباقات الأربع الجديدة (Phase 13 plan catalog)', () => {
    it('الباقات تحمل بالضبط الحدود التي طلبها المستخدم', async () => {
      const codes = [
        PLAN_CODES.BASIC,
        PLAN_CODES.STANDARD,
        PLAN_CODES.PREMIUM,
        PLAN_CODES.ENTERPRISE,
      ];
      const plans = await prisma.plan.findMany({ where: { code: { in: codes } } });
      const byCode = Object.fromEntries(plans.map((p) => [p.code, p]));

      expect(byCode[PLAN_CODES.BASIC]).toMatchObject({
        maxBranches: 1,
        maxCashiers: 2,
        maxAccountants: 1,
        maxManagers: 0,
        maxWarehouses: 1,
      });
      expect(byCode[PLAN_CODES.STANDARD]).toMatchObject({
        maxBranches: 2,
        maxCashiers: 4,
        maxAccountants: 1,
        maxManagers: 1,
        maxWarehouses: 1,
      });
      expect(byCode[PLAN_CODES.PREMIUM]).toMatchObject({
        maxBranches: 3,
        maxCashiers: 6,
        maxAccountants: 1,
        maxManagers: 1,
        maxWarehouses: 2,
      });
      // Enterprise ships with no default limits - real limits are set per
      // customer via subscription overrides once they sign up.
      expect(byCode[PLAN_CODES.ENTERPRISE]).toMatchObject({
        maxBranches: null,
        maxCashiers: null,
        maxAccountants: null,
        maxManagers: null,
        maxWarehouses: null,
      });
    });

    it('كتالوج الخطط للتاجر (subscriptions/plans) يعرض الحدود الجديدة أيضًا', async () => {
      const tenant = await registerTenant();
      const res = await request(server)
        .get('/api/v1/subscriptions/plans')
        .set(auth(tenant.accessToken))
        .expect(200);

      const basic = res.body.find((p: any) => p.code === PLAN_CODES.BASIC);
      expect(basic.maxCashiers).toBe(2);
      expect(basic.maxManagers).toBe(0);
      expect(basic.maxWarehouses).toBe(1);
    });
  });

  describe('حدود الأدوار في الباقة الأولى (Basic: 1 فرع، 2 نقطة بيع، 1 محاسب، 0 مدير، 1 مخزن)', () => {
    it('حد حسابات نقاط البيع (Cashier) يُنفَّذ بالضبط', async () => {
      const tenant = await registerTenant();
      await setPlan(tenant.companyId, PLAN_CODES.BASIC);

      await hire(tenant, 'Cashier');
      await hire(tenant, 'Cashier');
      const blocked = await hire(tenant, 'Cashier', undefined, { expectStatus: 403 });
      expect(blocked.body.error.message).toEqual(expect.any(String));
    });

    it('حد حسابات المحاسب (Accountant) يُنفَّذ بالضبط', async () => {
      const tenant = await registerTenant();
      await setPlan(tenant.companyId, PLAN_CODES.BASIC);

      await hire(tenant, 'Accountant');
      await hire(tenant, 'Accountant', undefined, { expectStatus: 403 });
    });

    it('الباقة الأولى لا تسمح بأي حساب مدير (maxManagers=0) - أول محاولة تُرفض فورًا', async () => {
      const tenant = await registerTenant();
      await setPlan(tenant.companyId, PLAN_CODES.BASIC);

      await hire(tenant, 'Manager', undefined, { expectStatus: 403 });
    });

    it('فرع ثانٍ يُرفض على الباقة الأولى (فرع واحد فقط)', async () => {
      const tenant = await registerTenant();
      await setPlan(tenant.companyId, PLAN_CODES.BASIC);

      await request(server)
        .post('/api/v1/tenancy/branches')
        .set(auth(tenant.accessToken))
        .send({ name: `فرع إضافي ${unique()}`, code: `BR-${unique()}` })
        .expect(403);
    });

    it('مخزن ثانٍ يُرفض على الباقة الأولى (مخزن واحد فقط - المخزن الافتراضي يشغل الحد بالفعل)', async () => {
      const tenant = await registerTenant();
      await setPlan(tenant.companyId, PLAN_CODES.BASIC);

      await request(server)
        .post('/api/v1/tenancy/warehouses')
        .set(auth(tenant.accessToken))
        .send({ branchId: tenant.branchId, name: `مخزن إضافي ${unique()}`, code: `WH-${unique()}` })
        .expect(403);
    });
  });

  describe('توسيع نطاق الفرع لا يُحتسب مرتين (Standard: 2 فرع)', () => {
    it('منح نفس الدور لعضوية بفرع مختلف (توسيع النطاق) لا يُصطدم بحد العدد', async () => {
      const tenant = await registerTenant();
      await setPlan(tenant.companyId, PLAN_CODES.STANDARD);

      const secondBranch = await request(server)
        .post('/api/v1/tenancy/branches')
        .set(auth(tenant.accessToken))
        .send({ name: `فرع ثانٍ ${unique()}`, code: `BR-${unique()}` })
        .expect(201);

      const created = await hire(tenant, 'Cashier', tenant.branchId);
      const userId = created.body.user.id;

      // Re-granting the SAME role to the SAME membership at the second
      // branch must not be blocked by maxCashiers - it's the same headcount,
      // just a wider scope, per IamService.assignRole's "first grant only" rule.
      await request(server)
        .post(`/api/v1/iam/users/${userId}/roles`)
        .set(auth(tenant.accessToken))
        .send({ roleId: tenant.roleIdByName.Cashier, branchId: secondBranch.body.id })
        .expect(201);
    });
  });

  describe('لوحة تحكم المنصة: حقول الحدود في نموذج الباقة (Plan editor limit fields)', () => {
    it('إنشاء باقة جديدة بحدود مخصصة عبر platform-admin يحفظها بالضبط', async () => {
      const adminToken = await adminLogin();
      const code = `test-p13-${unique()}`;
      const created = await request(server)
        .post('/api/v1/platform-admin/plans')
        .set(auth(adminToken))
        .send({
          code,
          name: 'خطة اختبار Phase 13',
          maxBranches: 4,
          maxCashiers: 9,
          maxAccountants: 2,
          maxManagers: 3,
          maxWarehouses: 5,
        })
        .expect(201);

      expect(created.body).toMatchObject({
        maxBranches: 4,
        maxCashiers: 9,
        maxAccountants: 2,
        maxManagers: 3,
        maxWarehouses: 5,
      });

      const updated = await request(server)
        .patch(`/api/v1/platform-admin/plans/${created.body.id}`)
        .set(auth(adminToken))
        .send({ maxCashiers: 20 })
        .expect(200);
      expect(updated.body.maxCashiers).toBe(20);
      // Untouched limit fields survive a partial update.
      expect(updated.body.maxManagers).toBe(3);
    });
  });

  describe('تخصيص اشتراك منشأة معينة (per-company overrides) - "أخصص أي باقة من لوحة التحكم"', () => {
    it('تجاوز حد نقاط البيع لمنشأة واحدة يرفع الحد الفعلي لها فقط، وإلغاؤه يعيد حد الباقة', async () => {
      const adminToken = await adminLogin();
      const tenant = await registerTenant();
      await setPlan(tenant.companyId, PLAN_CODES.BASIC);

      // Basic caps cashiers at 2 - fill it first.
      await hire(tenant, 'Cashier');
      await hire(tenant, 'Cashier');
      await hire(tenant, 'Cashier', undefined, { expectStatus: 403 });

      // Admin raises this ONE company's cashier limit to 3.
      const overridden = await request(server)
        .post(`/api/v1/platform-admin/companies/${tenant.companyId}/subscription/overrides`)
        .set(auth(adminToken))
        .send({ cashiersOverride: 3 })
        .expect(200);
      expect(overridden.body.cashiersOverride).toBe(3);

      await hire(tenant, 'Cashier');
      await hire(tenant, 'Cashier', undefined, { expectStatus: 403 });

      // Admin clears the override (explicit null) - the plan's own limit
      // (2) applies again, and this company is already over it.
      await request(server)
        .post(`/api/v1/platform-admin/companies/${tenant.companyId}/subscription/overrides`)
        .set(auth(adminToken))
        .send({ cashiersOverride: null })
        .expect(200);

      const view = await request(server)
        .get(`/api/v1/platform-admin/companies/${tenant.companyId}/subscription`)
        .set(auth(adminToken))
        .expect(200);
      expect(view.body.overrides.cashiersOverride).toBeNull();
      expect(view.body.usage.cashiers.limit).toBe(2);
      expect(view.body.usage.cashiers.current).toBe(3);
    });

    it('تفعيل خدمة قيّدها (productsOverride) لمنشأة واحدة فقط دون تغيير باقتها', async () => {
      const adminToken = await adminLogin();
      const tenant = await registerTenant();
      await setPlan(tenant.companyId, PLAN_CODES.BASIC);

      const before = await request(server)
        .get('/api/v1/subscriptions/me')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(before.body.plan.products).not.toContain('qeedha');

      await request(server)
        .post(`/api/v1/platform-admin/companies/${tenant.companyId}/subscription/overrides`)
        .set(auth(adminToken))
        .send({ productsOverride: ['qeedha_b', 'qeedha'] })
        .expect(200);

      const after = await request(server)
        .get('/api/v1/subscriptions/me')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(after.body.plan.products).toContain('qeedha');
      // The plan's own catalog code never changed - only this company's
      // effective product list did.
      expect(after.body.plan.code).toBe(PLAN_CODES.BASIC);
    });

    it('تخصيص منشأة لا يؤثر على منشأة أخرى (عزل تام بين المنشآت)', async () => {
      const adminToken = await adminLogin();
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      await setPlan(tenantA.companyId, PLAN_CODES.BASIC);
      await setPlan(tenantB.companyId, PLAN_CODES.BASIC);

      await request(server)
        .post(`/api/v1/platform-admin/companies/${tenantA.companyId}/subscription/overrides`)
        .set(auth(adminToken))
        .send({ cashiersOverride: 10, productsOverride: ['qeedha_b', 'qeedha'] })
        .expect(200);

      const bView = await request(server)
        .get(`/api/v1/platform-admin/companies/${tenantB.companyId}/subscription`)
        .set(auth(adminToken))
        .expect(200);
      expect(bView.body.overrides.cashiersOverride).toBeNull();
      expect(bView.body.overrides.productsOverride).toBeNull();
      expect(bView.body.usage.cashiers.limit).toBe(2);

      // Company B's own cashier limit (still 2) is unaffected by A's override.
      await hire(tenantB, 'Cashier');
      await hire(tenantB, 'Cashier');
      await hire(tenantB, 'Cashier', undefined, { expectStatus: 403 });
    });

    it('لا يمكن استدعاء مسارات التخصيص برمز تاجر عادي، ولا بلا رمز إطلاقًا', async () => {
      const tenant = await registerTenant();
      await request(server)
        .post(`/api/v1/platform-admin/companies/${tenant.companyId}/subscription/overrides`)
        .set(auth(tenant.accessToken))
        .send({ cashiersOverride: 99 })
        .expect(401);
      await request(server)
        .post(`/api/v1/platform-admin/companies/${tenant.companyId}/subscription/overrides`)
        .send({ cashiersOverride: 99 })
        .expect(401);
    });
  });
});
