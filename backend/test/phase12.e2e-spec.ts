import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const unique = () => randomUUID().slice(0, 8);

/**
 * Phase 12: Company.subscriptionNumber ("رقم الاشتراك") as a 3rd owner-login
 * identifier, and the entry point for employee login (subscriptionNumber +
 * branch + username + password). See docs/DOMAIN_MODEL.md "Login and
 * tenant selection" and AuthService.login/employeeLogin.
 *
 * Username scoping (username collision-free BETWEEN companies) is covered
 * in team-accounts.e2e-spec.ts, not repeated here.
 */
describe('Phase 12: subscriptionNumber owner login + employee login + branch scope (e2e)', () => {
  let app: INestApplication;
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
        legalName: `منشأة ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `owner-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
      })
      .expect(201);
    return {
      accessToken: res.body.accessToken as string,
      subscriptionNumber: res.body.company.subscriptionNumber as number,
    };
  };

  const getRoleId = async (token: string, name: string) => {
    const roles = await request(server).get('/api/v1/iam/roles').set(auth(token)).expect(200);
    const role = roles.body.find((r: any) => r.name === name);
    if (!role) throw new Error(`role not found: ${name}`);
    return role.id as string;
  };

  const getMainBranchId = async (token: string) => {
    const branches = await request(server)
      .get('/api/v1/tenancy/branches')
      .set(auth(token))
      .expect(200);
    const branch = branches.body.find((b: any) => b.code === 'MAIN');
    if (!branch) throw new Error('MAIN branch not found');
    return branch.id as string;
  };

  it('يُصدَر رقم اشتراك تسلسلي فريد (>= 10001) لكل منشأة جديدة', async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    expect(Number.isInteger(a.subscriptionNumber)).toBe(true);
    expect(a.subscriptionNumber).toBeGreaterThanOrEqual(10001);
    expect(b.subscriptionNumber).toBeGreaterThan(a.subscriptionNumber);
  });

  it('التاجر يسجّل الدخول برقم الاشتراك بدل البريد/الجوال', async () => {
    const owner = await registerTenant();

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: String(owner.subscriptionNumber), password: 'SuperSecret123' })
      .expect(200);

    expect(login.body.activeTenant).toBeDefined();
    const me = await request(server)
      .get('/api/v1/auth/me')
      .set(auth(login.body.accessToken))
      .expect(200);
    expect(me.body.subscriptionNumber).toBe(owner.subscriptionNumber);
  });

  it('رقم اشتراك صحيح مع كلمة مرور خاطئة يُرفض (خطأ عام، لا يكشف أي تفصيل)', async () => {
    const owner = await registerTenant();
    await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: String(owner.subscriptionNumber), password: 'WrongPassword123' })
      .expect(401);
  });

  it('رقم اشتراك غير موجود يُرفض بنفس رسالة الخطأ العامة', async () => {
    await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: '99999999', password: 'AnyPassword123' })
      .expect(401);
  });

  it('قائمة الفروع لتسجيل دخول الموظف تُعاد من رقم الاشتراك (بلا حاجة لأي مصادقة)، بلا كشف اسم الشركة', async () => {
    const owner = await registerTenant();
    const res = await request(server)
      .get(`/api/v1/auth/companies/${owner.subscriptionNumber}/branches`)
      .expect(200);
    expect(res.body.branches.length).toBe(1);
    expect(res.body.branches[0].name).toBe('الفرع الرئيسي');
    // Security fix: subscriptionNumber is a plain sequential integer, so
    // this public endpoint must never confirm a company's identity to an
    // unauthenticated caller - otherwise scanning 10001, 10002, ... would
    // harvest a named roster of every company on the platform.
    expect(res.body.companyLegalName).toBeUndefined();
  });

  it('رقم اشتراك غير موجود لقائمة الفروع يُعيد 404', async () => {
    await request(server).get('/api/v1/auth/companies/99999999/branches').expect(404);
  });

  it('موظف مقيَّد بفرع معيّن لا يستطيع الدخول باختيار فرع آخر (403)، ويستطيع الدخول على فرعه', async () => {
    const owner = await registerTenant();
    const mainBranchId = await getMainBranchId(owner.accessToken);

    const secondBranch = await request(server)
      .post('/api/v1/tenancy/branches')
      .set(auth(owner.accessToken))
      .send({ name: 'الفرع الثاني', code: 'BR2' })
      .expect(201);
    const secondBranchId = secondBranch.body.id as string;

    const cashierRoleId = await getRoleId(owner.accessToken, 'Cashier');
    const username = `cashier-${unique()}`;

    // branchId at creation scopes the Cashier role to mainBranchId only -
    // this employee has no company-wide role, so the second branch must
    // be off-limits even though it belongs to the same company.
    await request(server)
      .post('/api/v1/iam/users')
      .set(auth(owner.accessToken))
      .send({
        fullName: 'كاشير مقيّد بفرع',
        username,
        password: 'CashierPass123',
        roleId: cashierRoleId,
        branchId: mainBranchId,
      })
      .expect(201);

    await request(server)
      .post('/api/v1/auth/employee-login')
      .send({
        subscriptionNumber: owner.subscriptionNumber,
        branchId: secondBranchId,
        username,
        password: 'CashierPass123',
      })
      .expect(403);

    await request(server)
      .post('/api/v1/auth/employee-login')
      .send({
        subscriptionNumber: owner.subscriptionNumber,
        branchId: mainBranchId,
        username,
        password: 'CashierPass123',
      })
      .expect(200);
  });

  it('لا يجوز اختيار فرع لا ينتمي لهذه المنشأة عند تسجيل دخول الموظف', async () => {
    const ownerA = await registerTenant();
    const ownerB = await registerTenant();
    const branchIdB = await getMainBranchId(ownerB.accessToken);
    const cashierRoleA = await getRoleId(ownerA.accessToken, 'Cashier');
    const username = `cashier-${unique()}`;

    await request(server)
      .post('/api/v1/iam/users')
      .set(auth(ownerA.accessToken))
      .send({
        fullName: 'كاشير منشأة أ',
        username,
        password: 'CashierPass123',
        roleId: cashierRoleA,
      })
      .expect(201);

    // Company A's subscriptionNumber, but Company B's branch id - must
    // fail the same generic way as any other wrong credential, not leak
    // that the branch belongs to a different company.
    await request(server)
      .post('/api/v1/auth/employee-login')
      .send({
        subscriptionNumber: ownerA.subscriptionNumber,
        branchId: branchIdB,
        username,
        password: 'CashierPass123',
      })
      .expect(401);
  });
});
