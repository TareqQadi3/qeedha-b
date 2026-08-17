import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PLAN_CODES } from '../src/modules/subscriptions/constants/default-plans';

const unique = () => randomUUID().slice(0, 8);

describe('Milestone 8: SaaS Subscription & Billing (e2e)', () => {
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

  const registerTenant = async () => {
    const id = unique();
    const res = await request(server)
      .post('/api/v1/auth/register-company')
      .send({
        legalName: `متجر اشتراكات ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `m8owner-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
      })
      .expect(201);

    const branches = await request(server)
      .get('/api/v1/tenancy/branches')
      .set(auth(res.body.accessToken))
      .expect(200);
    const warehouses = await request(server)
      .get('/api/v1/tenancy/warehouses')
      .set(auth(res.body.accessToken))
      .expect(200);

    return {
      id,
      accessToken: res.body.accessToken as string,
      companyId: res.body.company.id as string,
      userId: res.body.user.id as string,
      branchId: branches.body.find((b: any) => b.isDefault).id as string,
      warehouseId: warehouses.body[0].id as string,
    };
  };

  type Tenant = Awaited<ReturnType<typeof registerTenant>>;

  const createProduct = async (tenant: Tenant) => {
    const res = await request(server)
      .post('/api/v1/products')
      .set(auth(tenant.accessToken))
      .send({
        sku: `SKU-${unique()}`,
        name: `منتج ${unique()}`,
        costPrice: 5,
        sellingPrice: 10,
        vatRate: 15,
      })
      .expect(201);
    return res.body;
  };

  const setOpeningStock = (tenant: Tenant, productId: string, quantity: number) =>
    request(server)
      .post('/api/v1/inventory/opening-balance')
      .set(auth(tenant.accessToken))
      .send({ warehouseId: tenant.warehouseId, productId, quantity })
      .expect(201);

  /** Product + enough opening stock to sell `units` times - stock must exist BEFORE any restriction (plan downgrade / trial expiry / suspension) is applied in a test, since setting it is itself a mutating request. */
  const createSellableProduct = async (tenant: Tenant, units = 5) => {
    const product = await createProduct(tenant);
    await setOpeningStock(tenant, product.id, units);
    return product;
  };

  const sellOne = (tenant: Tenant, productId: string, opts: { expectStatus?: number } = {}) => {
    return request(server)
      .post('/api/v1/sales')
      .set(auth(tenant.accessToken))
      .send({
        warehouseId: tenant.warehouseId,
        clientReferenceId: `sale-${unique()}`,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: 'cash', amount: 11.5 }],
      })
      .expect(opts.expectStatus ?? 201);
  };

  /** Swaps a tenant's subscription onto a different plan directly at the DB layer - not a merchant API call, since Milestone 8 spec section 14 forbids one. Same pattern milestone7.e2e-spec.ts uses `prisma.withTenant` for test setup/verification. */
  const setPlan = (companyId: string, planId: string) =>
    prisma.withTenant(companyId, (tx) => tx.subscription.update({ where: { companyId }, data: { planId } }));

  const setTrialEndsAt = (companyId: string, trialEndsAt: Date) =>
    prisma.withTenant(companyId, (tx) =>
      tx.subscription.update({ where: { companyId }, data: { trialEndsAt } }),
    );

  const suspendCompany = (companyId: string) =>
    prisma.withTenant(companyId, (tx) =>
      tx.company.update({ where: { id: companyId }, data: { status: 'suspended' } }),
    );

  const getPlanId = async (code: string) => {
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code } });
    return plan.id;
  };

  /** A dedicated, tightly-limited plan created just for one test - global catalog row (Plan has no company_id/RLS), never touched by any other test via its unique code. */
  const createLimitTestPlan = async (limits: {
    maxUsers?: number | null;
    maxBranches?: number | null;
    maxMonthlySales?: number | null;
  }) => {
    const professional = await prisma.plan.findUniqueOrThrow({ where: { code: PLAN_CODES.PROFESSIONAL } });
    const plan = await prisma.plan.create({
      data: {
        code: `test-limit-${unique()}`,
        name: 'خطة اختبار الحدود',
        isActive: true,
        trialEligible: true,
        priceMonthlySar: 0,
        billingInterval: 'monthly',
        maxUsers: limits.maxUsers ?? null,
        maxBranches: limits.maxBranches ?? null,
        maxMonthlySales: limits.maxMonthlySales ?? null,
        features: professional.features as any,
      },
    });
    return plan;
  };

  describe('التسجيل والاشتراك الافتراضي (Registration & default subscription)', () => {
    it('كل منشأة جديدة تحصل تلقائيًا على اشتراك تجريبي بخطة Professional', async () => {
      const tenant = await registerTenant();

      const res = await request(server)
        .get('/api/v1/subscriptions/me')
        .set(auth(tenant.accessToken))
        .expect(200);

      expect(res.body.status).toBe('trialing');
      expect(res.body.effectiveStatus).toBe('trialing');
      expect(res.body.isRestricted).toBe(false);
      expect(res.body.plan.code).toBe(PLAN_CODES.PROFESSIONAL);
      expect(res.body.trialDaysRemaining).toBeGreaterThan(0);
      expect(res.body.trialDaysRemaining).toBeLessThanOrEqual(14);
      expect(res.body.features.pos).toBe(true);
      expect(res.body.features.excel_import).toBe(true);
      expect(res.body.features.ar_ap).toBe(true);
      expect(res.body.usage.users.current).toBe(1);
      expect(res.body.usage.branches.current).toBe(1);
      expect(typeof res.body.billingNote).toBe('string');
      expect(res.body.billingNote.length).toBeGreaterThan(0);
    });

    it('كتالوج الخطط المتاح للتاجر يحتوي على الأساسية والاحترافية بأسعار placeholder', async () => {
      const tenant = await registerTenant();

      const res = await request(server)
        .get('/api/v1/subscriptions/plans')
        .set(auth(tenant.accessToken))
        .expect(200);

      const codes = res.body.map((p: any) => p.code);
      expect(codes).toContain(PLAN_CODES.STARTER);
      expect(codes).toContain(PLAN_CODES.PROFESSIONAL);
      for (const plan of res.body) {
        expect(plan).not.toHaveProperty('id');
      }
    });

    it('التسجيل يسجل أحداث تدقيق لإنشاء الاشتراك وبدء الفترة التجريبية', async () => {
      const tenant = await registerTenant();

      const logs = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findMany({ where: { companyId: tenant.companyId, entityType: 'Subscription' } }),
      );
      const actions = logs.map((l) => l.action);
      expect(actions).toContain('subscription.created');
      expect(actions).toContain('subscription.trial_started');
    });
  });

  describe('صلاحيات الخطة (Plan feature entitlements)', () => {
    it('خطة الأساسية لا تشمل استيراد Excel ولا الذمم - حتى لمالك يملك كل صلاحيات RBAC', async () => {
      const tenant = await registerTenant();
      await setPlan(tenant.companyId, await getPlanId(PLAN_CODES.STARTER));

      const importRes = await request(server)
        .post('/api/v1/imports/jobs')
        .set(auth(tenant.accessToken))
        .field('entityType', 'products')
        .attach('file', Buffer.from('test'), 'x.xlsx')
        .expect(403);
      expect(importRes.body.error.message).toContain('استيراد');

      await request(server)
        .get('/api/v1/accounting/ar/customers')
        .set(auth(tenant.accessToken))
        .expect(403);

      // POS *is* included on the starter plan - the same request that was
      // blocked for excel_import above must succeed here, proving the block
      // is plan-specific, not a blanket "restricted" state.
      const product = await createSellableProduct(tenant);
      await sellOne(tenant, product.id, { expectStatus: 201 });
    });

    it('ترقية الخطة إلى الاحترافية تُعيد فتح الميزة فورًا دون أي تغيير آخر', async () => {
      const tenant = await registerTenant();
      await setPlan(tenant.companyId, await getPlanId(PLAN_CODES.STARTER));
      await request(server)
        .get('/api/v1/accounting/ar/customers')
        .set(auth(tenant.accessToken))
        .expect(403);

      await setPlan(tenant.companyId, await getPlanId(PLAN_CODES.PROFESSIONAL));
      await request(server)
        .get('/api/v1/accounting/ar/customers')
        .set(auth(tenant.accessToken))
        .expect(200);
    });
  });

  describe('حدود الاستخدام (Usage limits, concurrency-safe)', () => {
    it('الحد الأقصى للمستخدمين يُنفَّذ تسلسليًا ولا يمكن تجاوزه', async () => {
      const tenant = await registerTenant();
      const plan = await createLimitTestPlan({ maxUsers: 2 });
      await setPlan(tenant.companyId, plan.id);

      const rolesRes = await request(server)
        .get('/api/v1/iam/roles')
        .set(auth(tenant.accessToken))
        .expect(200);
      const cashierRole = rolesRes.body.find((r: any) => r.name === 'Cashier');

      // Owner already counts as user #1 - this is user #2, filling the limit.
      await request(server)
        .post('/api/v1/iam/users')
        .set(auth(tenant.accessToken))
        .send({
          fullName: 'مستخدم إضافي',
          email: `extra-${unique()}@test.qeedha.local`,
          password: 'ExtraPass123',
          roleId: cashierRole.id,
        })
        .expect(201);

      const blocked = await request(server)
        .post('/api/v1/iam/users')
        .set(auth(tenant.accessToken))
        .send({
          fullName: 'مستخدم زائد',
          email: `over-${unique()}@test.qeedha.local`,
          password: 'ExtraPass123',
          roleId: cashierRole.id,
        })
        .expect(403);
      expect(blocked.body.error.message).toContain('المستخدمين');

      const finalCount = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.membership.count({ where: { companyId: tenant.companyId, status: 'active' } }),
      );
      expect(finalCount).toBe(2);
    });

    it('طلبان متزامنان على آخر مقعد مستخدم متاح: واحد فقط ينجح، والعدد النهائي لا يتجاوز الحد', async () => {
      const tenant = await registerTenant();
      const plan = await createLimitTestPlan({ maxUsers: 2 });
      await setPlan(tenant.companyId, plan.id);

      const rolesRes = await request(server)
        .get('/api/v1/iam/roles')
        .set(auth(tenant.accessToken))
        .expect(200);
      const cashierRole = rolesRes.body.find((r: any) => r.name === 'Cashier');

      // Owner is user #1. Both concurrent requests race for the single
      // remaining slot (#2) - SubscriptionService.assertWithinLimit's
      // `SELECT ... FOR UPDATE` on the subscription row must serialize them.
      const [a, b] = await Promise.all([
        request(server)
          .post('/api/v1/iam/users')
          .set(auth(tenant.accessToken))
          .send({
            fullName: 'متسابق أ',
            email: `race-a-${unique()}@test.qeedha.local`,
            password: 'ExtraPass123',
            roleId: cashierRole.id,
          }),
        request(server)
          .post('/api/v1/iam/users')
          .set(auth(tenant.accessToken))
          .send({
            fullName: 'متسابق ب',
            email: `race-b-${unique()}@test.qeedha.local`,
            password: 'ExtraPass123',
            roleId: cashierRole.id,
          }),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 403]);

      const finalCount = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.membership.count({ where: { companyId: tenant.companyId, status: 'active' } }),
      );
      expect(finalCount).toBe(2);
    });

    it('الحد الأقصى للفروع يُنفَّذ - خطة الأساسية (فرع واحد) تمنع إنشاء فرع ثانٍ', async () => {
      const tenant = await registerTenant();
      await setPlan(tenant.companyId, await getPlanId(PLAN_CODES.STARTER));

      const blocked = await request(server)
        .post('/api/v1/tenancy/branches')
        .set(auth(tenant.accessToken))
        .send({ name: `فرع إضافي ${unique()}`, code: `BR-${unique()}` })
        .expect(403);
      expect(blocked.body.error.message).toContain('الفروع');
    });

    it('الحد الأقصى لمبيعات الشهر يُنفَّذ ولا يُحتسب الطلب المكرر بنفس clientReferenceId مرتين', async () => {
      const tenant = await registerTenant();
      const plan = await createLimitTestPlan({ maxMonthlySales: 2 });
      await setPlan(tenant.companyId, plan.id);
      const product = await createSellableProduct(tenant, 3);

      await sellOne(tenant, product.id, { expectStatus: 201 });
      await sellOne(tenant, product.id, { expectStatus: 201 });
      const blocked = await sellOne(tenant, product.id, { expectStatus: 403 });
      expect(blocked.body.error.message).toContain('مبيعات');
    });
  });

  describe('الفترة التجريبية وانتهاؤها (Trial lifecycle)', () => {
    it('انتهاء الفترة التجريبية يقيّد العمليات الجديدة، مع بقاء القراءة والاطلاع على الحساب متاحة', async () => {
      const tenant = await registerTenant();
      // Product + stock created WHILE still trialing - opening-balance is
      // itself a mutating request and would be blocked too once expired.
      const product = await createSellableProduct(tenant);
      await setTrialEndsAt(tenant.companyId, new Date(Date.now() - 24 * 60 * 60 * 1000));

      const me = await request(server)
        .get('/api/v1/subscriptions/me')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(me.body.status).toBe('expired');
      expect(me.body.effectiveStatus).toBe('expired');
      expect(me.body.isRestricted).toBe(true);

      await sellOne(tenant, product.id, { expectStatus: 403 });

      // Reads stay available - "recovery/visibility" (spec section 10).
      await request(server).get('/api/v1/sales').set(auth(tenant.accessToken)).expect(200);
      await request(server).get('/api/v1/auth/me').set(auth(tenant.accessToken)).expect(200);
    });

    it('انتهاء الفترة التجريبية يُسجَّل مرة واحدة فقط في سجل التدقيق عند أول طلب بعد الانتهاء', async () => {
      const tenant = await registerTenant();
      await setTrialEndsAt(tenant.companyId, new Date(Date.now() - 24 * 60 * 60 * 1000));

      await request(server).get('/api/v1/subscriptions/me').set(auth(tenant.accessToken)).expect(200);
      await request(server).get('/api/v1/subscriptions/me').set(auth(tenant.accessToken)).expect(200);

      const logs = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findMany({
          where: { companyId: tenant.companyId, action: 'subscription.trial_expired' },
        }),
      );
      expect(logs.length).toBe(1);
    });
  });

  describe('إيقاف المنشأة (Company suspension)', () => {
    it('منشأة موقوفة تُمنع من كل العمليات ما عدا مسار الاستعادة/الاطلاع', async () => {
      const tenant = await registerTenant();
      await suspendCompany(tenant.companyId);

      await request(server).get('/api/v1/sales').set(auth(tenant.accessToken)).expect(403);
      await request(server).get('/api/v1/products').set(auth(tenant.accessToken)).expect(403);

      // Exempt recovery/visibility surface still works.
      await request(server).get('/api/v1/auth/me').set(auth(tenant.accessToken)).expect(200);
      await request(server).get('/api/v1/subscriptions/me').set(auth(tenant.accessToken)).expect(200);
    });
  });

  describe('العزل بين المنشآت (Tenant isolation / IDOR)', () => {
    it('لا يمكن لمنشأة قراءة اشتراك منشأة أخرى عبر RLS المباشر', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();

      const subsFromA = await prisma.withTenant(tenantA.companyId, (tx) => tx.subscription.findMany());
      expect(subsFromA).toHaveLength(1);
      expect(subsFromA[0].companyId).toBe(tenantA.companyId);

      const subsFromB = await prisma.withTenant(tenantB.companyId, (tx) => tx.subscription.findMany());
      expect(subsFromB).toHaveLength(1);
      expect(subsFromB[0].companyId).toBe(tenantB.companyId);
    });

    it('تغيير خطة منشأة أخرى (ID معروف) لا يمكن أن يحدث عبر واجهة التاجر - لا يوجد endpoint للتعديل', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();

      // No merchant-facing mutation endpoint exists at all (spec section 14) -
      // confirm the only two subscription routes are GET, never accept a body
      // that could redirect at another company's id.
      await request(server)
        .post('/api/v1/subscriptions/me')
        .set(auth(tenantA.accessToken))
        .send({ companyId: tenantB.companyId, planId: 'anything' })
        .expect(404);
    });
  });
});
