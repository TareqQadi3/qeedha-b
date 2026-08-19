import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const unique = () => randomUUID().slice(0, 8);

const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_SEED_EMAIL!;
const ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_SEED_PASSWORD!;

/**
 * Phase 9 (SaaS Subscription & Production Readiness) coverage - only the
 * NEW behavior this phase adds, on top of the already-covered
 * platform-admin.e2e-spec.ts / website.e2e-spec.ts suites (not repeated
 * here): product-entitlement enforcement (a plan without "qeedha_b"
 * blocks the whole app, reads included), per-plan configurable trial
 * length, concurrent-registration safety at the database level, and the
 * affiliate self-service dashboard (login + isolation from other
 * affiliates' data).
 */
describe('Phase 9 (e2e)', () => {
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

  const adminLogin = () =>
    request(server)
      .post('/api/v1/platform-admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200)
      .then((res) => res.body.accessToken as string);

  const registerCompany = (body: Record<string, unknown>) =>
    request(server).post('/api/v1/auth/register-company').send(body);

  // ---------------------------------------------------------------------
  // Product entitlement: a plan without "qeedha_b" blocks the whole app
  // ---------------------------------------------------------------------
  it('منشأة على باقة qeedha فقط (بلا qeedha_b) تُمنع من كل مسارات qeedha B، قراءةً وكتابةً، مع بقاء المسارات المُعفاة متاحة', async () => {
    const adminToken = await adminLogin();
    const id = unique();
    const planCode = `qeedha-only-${id}`;

    await request(server)
      .post('/api/v1/platform-admin/plans')
      .set(auth(adminToken))
      .send({
        code: planCode,
        name: `qeedha فقط ${id}`,
        priceMonthlySar: 199,
        products: ['qeedha'],
      })
      .expect(201);

    const res = await registerCompany({
      legalName: `منشأة قيدها ${id}`,
      planCode,
      ownerFullName: `مالك ${id}`,
      ownerEmail: `qeedha-only-${id}@test.qeedha.local`,
      password: 'SuperSecret123',
    }).expect(201);
    const ownerToken = res.body.accessToken as string;

    // Blocked - even a plain read, not just mutations (stronger than the
    // expired/suspended "restricted" check, which only blocks writes).
    await request(server).get('/api/v1/catalog/units').set(auth(ownerToken)).expect(403);
    await request(server)
      .post('/api/v1/catalog/units')
      .set(auth(ownerToken))
      .send({ name: 'وحدة' })
      .expect(403);

    // Exempt session/account-visibility routes stay reachable regardless.
    await request(server).get('/api/v1/auth/me').set(auth(ownerToken)).expect(200);
  });

  // ---------------------------------------------------------------------
  // Per-plan configurable trial length (Control Center "Trial period")
  // ---------------------------------------------------------------------
  it('مدير المنصة يضبط مدة تجربة مخصَّصة لباقة، والتسجيل عليها يمنح بالضبط تلك المدة', async () => {
    const adminToken = await adminLogin();
    const id = unique();
    const planCode = `custom-trial-${id}`;

    await request(server)
      .post('/api/v1/platform-admin/plans')
      .set(auth(adminToken))
      .send({ code: planCode, name: `تجربة 30 يومًا ${id}`, priceMonthlySar: 149, trialDays: 30 })
      .expect(201);

    const before = Date.now();
    const res = await registerCompany({
      legalName: `منشأة تجربة 30 ${id}`,
      planCode,
      ownerFullName: `مالك ${id}`,
      ownerEmail: `custom-trial-${id}@test.qeedha.local`,
      password: 'SuperSecret123',
    }).expect(201);

    const list = await request(server)
      .get('/api/v1/platform-admin/companies')
      .set(auth(adminToken))
      .expect(200);
    const company = list.body.find((c: any) => c.id === res.body.company.id);
    const trialEndsAt = new Date(company.subscription.trialEndsAt).getTime();
    const expectedDays = (trialEndsAt - before) / (24 * 60 * 60 * 1000);
    expect(expectedDays).toBeGreaterThan(29.9);
    expect(expectedDays).toBeLessThan(30.1);
  });

  // ---------------------------------------------------------------------
  // Concurrent registration safety (DB-level partial unique index backstop)
  // ---------------------------------------------------------------------
  it('تسجيلان متزامنان بنفس البريد الإلكتروني بالضبط - واحد فقط ينجح، والآخر يُرفض بأمان دون تسريب', async () => {
    const id = unique();
    const email = `race-${id}@test.qeedha.local`;
    const attempt = (legalName: string) =>
      registerCompany({
        legalName,
        ownerFullName: 'متسابق',
        ownerEmail: email,
        password: 'SuperSecret123',
      });

    const [first, second] = await Promise.all([attempt(`سباق أ ${id}`), attempt(`سباق ب ${id}`)]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  // ---------------------------------------------------------------------
  // Affiliate self-service dashboard: login + isolation from other affiliates
  // ---------------------------------------------------------------------
  it('لوحة المسوّق بالعمولة: يسجّل الدخول، يرى إحالاته وعمولاته فقط، ولا يستطيع الوصول لمسارات مركز التحكم', async () => {
    const adminToken = await adminLogin();
    const idA = unique();
    const idB = unique();

    // Affiliate A registers, refers a company, gets it activated (a real commission).
    const affiliateA = await request(server)
      .post('/api/v1/affiliates/register')
      .send({
        fullName: `مسوّق أ ${idA}`,
        email: `affiliate-a-${idA}@test.qeedha.local`,
        password: 'AffiliatePass123',
      })
      .expect(201);

    const referred = await registerCompany({
      legalName: `منشأة أُحيلت ${idA}`,
      planCode: 'starter',
      referralCode: affiliateA.body.code,
      ownerFullName: `مالك ${idA}`,
      ownerEmail: `referred-${idA}@test.qeedha.local`,
      password: 'SuperSecret123',
    }).expect(201);

    await request(server)
      .post(`/api/v1/platform-admin/companies/${referred.body.company.id}/subscription/status`)
      .set(auth(adminToken))
      .send({ status: 'active' })
      .expect(200);

    // Affiliate B - unrelated, no referrals.
    await request(server)
      .post('/api/v1/affiliates/register')
      .send({
        fullName: `مسوّق ب ${idB}`,
        email: `affiliate-b-${idB}@test.qeedha.local`,
        password: 'AffiliatePass123',
      })
      .expect(201);

    const loginA = await request(server)
      .post('/api/v1/affiliates/login')
      .send({ email: `affiliate-a-${idA}@test.qeedha.local`, password: 'AffiliatePass123' })
      .expect(200);
    const loginB = await request(server)
      .post('/api/v1/affiliates/login')
      .send({ email: `affiliate-b-${idB}@test.qeedha.local`, password: 'AffiliatePass123' })
      .expect(200);

    const dashboardA = await request(server)
      .get('/api/v1/affiliates/dashboard')
      .set(auth(loginA.body.accessToken))
      .expect(200);
    expect(dashboardA.body.summary.totalReferrals).toBe(1);
    expect(dashboardA.body.summary.conversions).toBe(1);
    expect(dashboardA.body.summary.pendingCommissionSar).toBeGreaterThan(0);

    const dashboardB = await request(server)
      .get('/api/v1/affiliates/dashboard')
      .set(auth(loginB.body.accessToken))
      .expect(200);
    expect(dashboardB.body.summary.totalReferrals).toBe(0);
    expect(dashboardB.body.referrals).toEqual([]);

    // Wrong password rejected, no distinct error for "no password set" vs "wrong password".
    await request(server)
      .post('/api/v1/affiliates/login')
      .send({ email: `affiliate-a-${idA}@test.qeedha.local`, password: 'WrongPassword123' })
      .expect(401);

    // An affiliate token must never be accepted on Control Center routes, and vice versa.
    await request(server)
      .get('/api/v1/platform-admin/companies')
      .set(auth(loginA.body.accessToken))
      .expect(401);
    await request(server).get('/api/v1/affiliates/dashboard').set(auth(adminToken)).expect(401);

    // No token at all - rejected.
    await request(server).get('/api/v1/affiliates/dashboard').expect(401);
  });
});
