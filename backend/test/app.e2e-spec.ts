import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { IntegrationRegistry } from '../src/modules/integrations/core/integration-registry.service';
import { PaymentIntegrationPort } from '../src/modules/integrations/core/ports/payment-integration.port';

/**
 * Every identifier is suffixed with a fresh UUID so repeated runs against
 * the shared qeedha_accounting_test database never collide on the global
 * unique email/mobile constraints (see docs/DATABASE.md and
 * prisma/schema.prisma users model comment).
 */
const unique = () => randomUUID().slice(0, 8);

describe('Phase 1 foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let registry: IntegrationRegistry;

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
    registry = app.get(IntegrationRegistry);
  });

  afterAll(async () => {
    await app.close();
  });

  const registerCompany = async (overrides: Partial<Record<string, string>> = {}) => {
    const id = unique();
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send({
        legalName: `متجر اختبار ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `owner-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
        ...overrides,
      })
      .expect(201);
    return { id, body: res.body as any };
  };

  describe('تسجيل منشأة جديدة (registerCompany)', () => {
    it('ينشئ Company + Branch افتراضي + Warehouse افتراضي + مستخدم Owner بكل الصلاحيات', async () => {
      const { body } = await registerCompany();

      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.company.id).toBeDefined();
      expect(body.user.id).toBeDefined();

      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);

      expect(me.body.roles).toEqual([{ name: 'Owner', branch: null }]);
      expect(me.body.permissions).toEqual(
        expect.arrayContaining(['iam.users.manage', 'settings.integrations.manage']),
      );

      const branches = await request(app.getHttpServer())
        .get('/api/v1/tenancy/branches')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(branches.body).toHaveLength(1);
      expect(branches.body[0].code).toBe('MAIN');
      expect(branches.body[0].isDefault).toBe(true);

      const warehouses = await request(app.getHttpServer())
        .get('/api/v1/tenancy/warehouses')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(warehouses.body).toHaveLength(1);
      expect(warehouses.body[0].branch.id).toBe(branches.body[0].id);
    });
  });

  describe('تسجيل الدخول (login)', () => {
    it('يرفض كلمة مرور خاطئة وبيانات غير موجودة برسالة عامة موحّدة', async () => {
      const { id } = await registerCompany();
      const email = `owner-${id}@test.qeedha.local`;

      const wrongPassword = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: email, password: 'WrongPassword' })
        .expect(401);
      expect(wrongPassword.body.error.message).toBe('بيانات الدخول غير صحيحة');

      const noSuchUser = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'nobody@test.qeedha.local', password: 'Whatever123' })
        .expect(401);
      expect(noSuchUser.body.error.message).toBe('بيانات الدخول غير صحيحة');
    });

    it('ينجح ببيانات صحيحة ويعيد access/refresh tokens', async () => {
      const { id } = await registerCompany();
      const email = `owner-${id}@test.qeedha.local`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: email, password: 'SuperSecret123' })
        .expect(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });
  });

  describe('Refresh token rotation', () => {
    it('يدوّر الرمز، ويكتشف إعادة استخدام رمز مُبطَل ويُبطل الجلسة كاملة', async () => {
      const { body } = await registerCompany();
      const r1 = body.refreshToken as string;

      const rotated = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: r1 })
        .expect(200);
      const r2 = rotated.body.refreshToken as string;
      expect(r2).not.toBe(r1);

      // Reusing r1 (already rotated/revoked) must fail AND revoke r2 too.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: r1 })
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: r2 })
        .expect(401);
    });
  });

  describe('RBAC', () => {
    it('يرفض مستخدمًا بدون الصلاحية المطلوبة بـ403 مع اسم الصلاحية الناقصة', async () => {
      const { id, body: owner } = await registerCompany();

      const roles = await request(app.getHttpServer())
        .get('/api/v1/iam/roles')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      const cashierRole = roles.body.find((r: any) => r.name === 'Cashier');
      expect(cashierRole).toBeDefined();

      const cashierEmail = `cashier-${id}@test.qeedha.local`;
      await request(app.getHttpServer())
        .post('/api/v1/iam/users')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          fullName: 'كاشير الاختبار',
          email: cashierEmail,
          password: 'CashierPass123',
          roleId: cashierRole.id,
        })
        .expect(201);

      const cashierLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: cashierEmail, password: 'CashierPass123' })
        .expect(200);

      const denied = await request(app.getHttpServer())
        .get('/api/v1/tenancy/branches')
        .set('Authorization', `Bearer ${cashierLogin.body.accessToken}`)
        .expect(403);
      expect(denied.body.error.message).toContain('tenancy.branches.view');
    });

    it('لا يُرجع passwordHash أبدًا في استجابات المستخدمين', async () => {
      const { body: owner } = await registerCompany();
      const res = await request(app.getHttpServer())
        .get('/api/v1/iam/users')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      for (const user of res.body) {
        expect(user.passwordHash).toBeUndefined();
      }
    });
  });

  describe('عزل المستأجرين (tenant isolation)', () => {
    it('لا يرى مستخدم منشأة A أي بيانات من منشأة B، حتى بمعرفة الـID مباشرة', async () => {
      const companyA = await registerCompany();
      const companyB = await registerCompany();

      const branchesA = await request(app.getHttpServer())
        .get('/api/v1/tenancy/branches')
        .set('Authorization', `Bearer ${companyA.body.accessToken}`)
        .expect(200);
      const branchesB = await request(app.getHttpServer())
        .get('/api/v1/tenancy/branches')
        .set('Authorization', `Bearer ${companyB.body.accessToken}`)
        .expect(200);

      expect(branchesA.body).toHaveLength(1);
      expect(branchesB.body).toHaveLength(1);
      expect(branchesA.body[0].id).not.toBe(branchesB.body[0].id);
      expect(branchesA.body[0].companyId).toBe(companyA.body.company.id);
      expect(branchesB.body[0].companyId).toBe(companyB.body.company.id);

      // Row-Level Security backstop, verified directly at the DB level:
      // company A's connection (SET LOCAL app.tenant_id = A) must not be
      // able to read company B's row even via a raw query with no WHERE.
      const rawFromA = await prisma.withTenant(companyA.body.company.id, (tx) =>
        tx.company.findMany(),
      );
      expect(rawFromA.map((c) => c.id)).toEqual([companyA.body.company.id]);
    });
  });

  describe('Audit Log', () => {
    it('يسجّل عملية إسناد دور مع من نفّذها والقيمة الجديدة', async () => {
      const { id, body: owner } = await registerCompany();

      const roles = await request(app.getHttpServer())
        .get('/api/v1/iam/roles')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      const managerRole = roles.body.find((r: any) => r.name === 'Manager');

      const newUser = await request(app.getHttpServer())
        .post('/api/v1/iam/users')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          fullName: 'مدير الاختبار',
          email: `manager-${id}@test.qeedha.local`,
          password: 'ManagerPass123',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/iam/users/${newUser.body.user.id}/roles`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ roleId: managerRole.id })
        .expect(201);

      const logs = await prisma.withTenant(owner.company.id, (tx) =>
        tx.auditLog.findMany({
          where: { companyId: owner.company.id, action: 'iam.user_role.assign' },
        }),
      );
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].actorUserId).toBe(owner.user.id);
      expect((logs[0].afterState as any).roleName).toBe('Manager');
    });
  });

  describe('Integration Layer skeleton (بدون أي Provider فعلي)', () => {
    it('يرفض connect بدون Adapter مسجَّل، وينجح بعد تسجيل Adapter تجريبي فقط للاختبار', async () => {
      const { body: owner } = await registerCompany();
      const providerKey = `test-provider-${unique()}`;

      // Not in the catalog at all yet.
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/connections/${providerKey}/connect`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(404);

      // Add it to the catalog (metadata only) - still no adapter registered.
      await prisma.withoutTenant((tx) =>
        tx.integrationProvider.create({
          data: { key: providerKey, name: 'Test Provider', category: 'payment' },
        }),
      );
      await request(app.getHttpServer())
        .post(`/api/v1/integrations/connections/${providerKey}/connect`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(422);

      // Register a throwaway fake adapter through the same extension point a
      // real provider (Qeedha or otherwise) would use - proves the port +
      // registry mechanism works without inventing any real provider's API.
      const fakeAdapter: PaymentIntegrationPort = {
        providerKey,
        initiatePayment: async () => ({ externalTransactionId: 'fake-1', status: 'success' }),
        getTransactionStatus: async () => 'success',
      };
      registry.register(fakeAdapter);

      const connected = await request(app.getHttpServer())
        .post(`/api/v1/integrations/connections/${providerKey}/connect`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(201);
      expect(connected.body.status).toBe('connected');

      const connections = await request(app.getHttpServer())
        .get('/api/v1/integrations/connections')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(connections.body.find((c: any) => c.providerKey === providerKey).status).toBe(
        'connected',
      );

      const disconnected = await request(app.getHttpServer())
        .post(`/api/v1/integrations/connections/${providerKey}/disconnect`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(201);
      expect(disconnected.body.status).toBe('disabled');

      registry.unregister(providerKey);
    });

    it('يستقبل Webhook عام لتكامل مسجَّل في الكتالوج ويرفضه لتكامل غير معروف', async () => {
      const providerKey = `test-webhook-${unique()}`;

      await request(app.getHttpServer())
        .post(`/api/v1/integrations/webhooks/${providerKey}`)
        .send({ event: 'whatever' })
        .expect(404);

      await prisma.withoutTenant((tx) =>
        tx.integrationProvider.create({
          data: { key: providerKey, name: 'Webhook Test Provider', category: 'payment' },
        }),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/webhooks/${providerKey}`)
        .send({ event: 'transaction.success', foo: 'bar' })
        .expect(202);
      expect(res.body.providerKey).toBe(providerKey);
      expect(res.body.processingStatus).toBe('received');
    });
  });
});
