import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomBytes, randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { hashToken } from '../src/common/utils/token-hash';

const unique = () => randomUUID().slice(0, 8);

const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_SEED_EMAIL!;
const ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_SEED_PASSWORD!;

/**
 * Website phase end-to-end coverage - the 6 scenarios (A-F) from the spec's
 * "COMPLETE END-TO-END TEST" section. Reuses the platform-admin.e2e-spec.ts
 * conventions (adminLogin helper, direct PrismaService access for
 * setup/assertions the API itself can't expose - e.g. consuming an
 * email-verification token, whose raw value is never returned by any
 * endpoint by design).
 */
describe('Website phase (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;

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
    prisma = app.get(PrismaService);
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
  // Scenario A: ar/SA/qeedha B trial - full registration -> verification journey
  // ---------------------------------------------------------------------
  it('السيناريو أ: تسجيل تاجر سعودي في باقة qeedha B التجريبية، وتأكيد بريده الإلكتروني', async () => {
    const id = unique();
    const ownerEmail = `scenario-a-${id}@test.qeedha.local`;
    const res = await registerCompany({
      legalName: `متجر أ ${id}`,
      countryCode: 'SA',
      planCode: 'starter',
      ownerFullName: `مالك أ ${id}`,
      ownerEmail,
      password: 'SuperSecret123',
    }).expect(201);

    expect(res.body.company.id).toEqual(expect.any(String));
    expect(res.body.accessToken).toEqual(expect.any(String));

    const me = await request(server)
      .get('/api/v1/auth/me')
      .set(auth(res.body.accessToken))
      .expect(200);
    expect(me.body.emailVerified).toBe(false);

    // The raw verification token is never returned by any endpoint (only
    // its hash is persisted - see AuthService.createCompanyWithOwner) so
    // this issues its own token directly at the DB layer to exercise the
    // consume endpoint, same "test setup at the DB layer" pattern
    // milestone8.e2e-spec.ts uses for subscription state.
    const rawToken = randomBytes(32).toString('hex');
    await prisma.emailVerificationToken.create({
      data: {
        userId: res.body.user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await request(server)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'وهمي-غير-صحيح' })
      .expect(401);

    const verify = await request(server)
      .post('/api/v1/auth/verify-email')
      .send({ token: rawToken })
      .expect(200);
    expect(verify.body.success).toBe(true);

    // A second consumption of the same token must fail - one-time use.
    await request(server).post('/api/v1/auth/verify-email').send({ token: rawToken }).expect(401);

    const meAfter = await request(server)
      .get('/api/v1/auth/me')
      .set(auth(res.body.accessToken))
      .expect(200);
    expect(meAfter.body.emailVerified).toBe(true);

    // Country + trial + product entitlement, as seen from the Control
    // Center (Scenario D also covers this path more broadly).
    const adminToken = await adminLogin();
    const list = await request(server)
      .get('/api/v1/platform-admin/companies')
      .set(auth(adminToken))
      .expect(200);
    const company = list.body.find((c: any) => c.id === res.body.company.id);
    expect(company.countryCode).toBe('SA');
    expect(company.subscription.status).toBe('trialing');
    expect(company.subscription.plan.products).toEqual(['qeedha_b']);
  });

  // ---------------------------------------------------------------------
  // Scenario B: combined qeedha B + qeedha entitlements
  // ---------------------------------------------------------------------
  it('السيناريو ب: باقة مدمجة (qeedha B + qeedha) تمنح المنشأة صلاحية الوصول للمنتجين معًا', async () => {
    const adminToken = await adminLogin();
    const id = unique();
    const planCode = `combined-e2e-${id}`;

    await request(server)
      .post('/api/v1/platform-admin/plans')
      .set(auth(adminToken))
      .send({
        code: planCode,
        name: `باقة مدمجة ${id}`,
        priceMonthlySar: 499,
        products: ['qeedha_b', 'qeedha'],
      })
      .expect(201);

    const res = await registerCompany({
      legalName: `متجر ب ${id}`,
      countryCode: 'SA',
      planCode,
      ownerFullName: `مالك ب ${id}`,
      ownerEmail: `scenario-b-${id}@test.qeedha.local`,
      password: 'SuperSecret123',
    }).expect(201);

    const list = await request(server)
      .get('/api/v1/platform-admin/companies')
      .set(auth(adminToken))
      .expect(200);
    const company = list.body.find((c: any) => c.id === res.body.company.id);
    expect(company.subscription.plan.products.sort()).toEqual(['qeedha', 'qeedha_b']);
  });

  // ---------------------------------------------------------------------
  // Scenario C: affiliate referral attribution + electronically-computed commission
  // ---------------------------------------------------------------------
  it('السيناريو ج: تسجيل مسوّق بالعمولة، إحالة تاجر عبر رمزه، واحتساب العمولة إلكترونيًا عند تفعيل الاشتراك', async () => {
    const adminToken = await adminLogin();
    const id = unique();

    const affiliateRes = await request(server)
      .post('/api/v1/affiliates/register')
      .send({ fullName: `مسوّق ${id}`, email: `affiliate-${id}@test.qeedha.local` })
      .expect(201);
    const referralCode = affiliateRes.body.code as string;
    expect(referralCode).toEqual(expect.any(String));

    const res = await registerCompany({
      legalName: `متجر ج ${id}`,
      countryCode: 'SA',
      planCode: 'starter', // priceMonthlySar 99
      referralCode,
      ownerFullName: `مالك ج ${id}`,
      ownerEmail: `scenario-c-${id}@test.qeedha.local`,
      password: 'SuperSecret123',
    }).expect(201);
    const companyId = res.body.company.id as string;

    const referral = await prisma.affiliateReferral.findUnique({
      where: { companyId },
      include: { commission: true },
    });
    expect(referral?.code).toBe(referralCode);
    expect(referral?.commission).toBeNull(); // not activated yet - no commission row

    // Activation is the one event that produces a commission (no payment
    // gateway is integrated - see AffiliatesService doc comment).
    await request(server)
      .post(`/api/v1/platform-admin/companies/${companyId}/subscription/status`)
      .set(auth(adminToken))
      .send({ status: 'active' })
      .expect(200);

    const affiliates = await request(server)
      .get('/api/v1/platform-admin/affiliates')
      .set(auth(adminToken))
      .expect(200);
    const affiliate = affiliates.body.find((a: any) => a.code === referralCode);
    expect(affiliate.referralsCount).toBe(1);
    expect(affiliate.pendingCommissionSar).toBeCloseTo(9.9, 5); // 99 * 10%

    // Idempotency: re-setting the same 'active' status must not double the commission.
    await request(server)
      .post(`/api/v1/platform-admin/companies/${companyId}/subscription/status`)
      .set(auth(adminToken))
      .send({ status: 'active' })
      .expect(200);
    const affiliatesAfter = await request(server)
      .get('/api/v1/platform-admin/affiliates')
      .set(auth(adminToken))
      .expect(200);
    const affiliateAfter = affiliatesAfter.body.find((a: any) => a.code === referralCode);
    expect(affiliateAfter.pendingCommissionSar).toBeCloseTo(9.9, 5);
  });

  // ---------------------------------------------------------------------
  // Scenario D: admin Control Center visibility + subscription management
  // ---------------------------------------------------------------------
  it('السيناريو د: مدير المنصة يرى المنشآت والإحصائيات ويدير الاشتراك (تمديد تجربة وتغيير باقة)', async () => {
    const adminToken = await adminLogin();
    const id = unique();
    const res = await registerCompany({
      legalName: `متجر د ${id}`,
      countryCode: 'SA',
      ownerFullName: `مالك د ${id}`,
      ownerEmail: `scenario-d-${id}@test.qeedha.local`,
      password: 'SuperSecret123',
    }).expect(201);
    const companyId = res.body.company.id as string;

    const overview = await request(server)
      .get('/api/v1/platform-admin/overview')
      .set(auth(adminToken))
      .expect(200);
    expect(overview.body.totalMerchants).toBeGreaterThan(0);
    expect(typeof overview.body.trialSubscriptions).toBe('number');

    const beforeList = await request(server)
      .get('/api/v1/platform-admin/companies')
      .set(auth(adminToken))
      .expect(200);
    const before = beforeList.body.find((c: any) => c.id === companyId);
    const trialEndsBefore = new Date(before.subscription.trialEndsAt).getTime();

    await request(server)
      .post(`/api/v1/platform-admin/companies/${companyId}/subscription/extend-trial`)
      .set(auth(adminToken))
      .send({ days: 30 })
      .expect(200);

    await request(server)
      .post(`/api/v1/platform-admin/companies/${companyId}/subscription/plan`)
      .set(auth(adminToken))
      .send({ planCode: 'starter' })
      .expect(200);

    const afterList = await request(server)
      .get('/api/v1/platform-admin/companies')
      .set(auth(adminToken))
      .expect(200);
    const after = afterList.body.find((c: any) => c.id === companyId);
    expect(new Date(after.subscription.trialEndsAt).getTime()).toBeGreaterThan(trialEndsBefore);
    expect(after.subscription.plan.code).toBe('starter');
  });

  // ---------------------------------------------------------------------
  // Scenario E: staff RBAC - narrow roles cannot reach sections outside their own
  // ---------------------------------------------------------------------
  it('السيناريو هـ: موظف بدور "دعم" لا يستطيع الوصول لأقسام المالية أو الإدارة العامة في مركز التحكم', async () => {
    const adminToken = await adminLogin();
    const id = unique();
    const supportEmail = `support-staff-${id}@test.qeedha.local`;
    await request(server)
      .post('/api/v1/platform-admin/staff')
      .set(auth(adminToken))
      .send({
        fullName: `موظف دعم ${id}`,
        email: supportEmail,
        password: 'StaffPass123',
        role: 'support',
      })
      .expect(201);

    const staffLogin = await request(server)
      .post('/api/v1/platform-admin/auth/login')
      .send({ email: supportEmail, password: 'StaffPass123' })
      .expect(200);
    const staffToken = staffLogin.body.accessToken as string;

    // Allowed: no role restriction at all.
    await request(server).get('/api/v1/platform-admin/companies').set(auth(staffToken)).expect(200);
    // Allowed: 'support' is explicitly permitted on Applications.
    await request(server)
      .get('/api/v1/platform-admin/applications')
      .set(auth(staffToken))
      .expect(200);

    // Denied: finance-only route.
    await request(server)
      .post('/api/v1/platform-admin/companies')
      .set(auth(staffToken))
      .send({
        legalName: 'محاولة غير مصرح بها',
        ownerFullName: 'تجربة',
        ownerEmail: `denied-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
      })
      .expect(403);
    // Denied: admin-only routes.
    await request(server).get('/api/v1/platform-admin/plans').set(auth(staffToken)).expect(403);
    await request(server).get('/api/v1/platform-admin/markets').set(auth(staffToken)).expect(403);
    await request(server).get('/api/v1/platform-admin/staff').set(auth(staffToken)).expect(403);

    // A 'finance' staff member is the mirror case: allowed on subscription
    // actions, denied on admin-only and marketing/support-only routes.
    const financeEmail = `finance-staff-${id}@test.qeedha.local`;
    await request(server)
      .post('/api/v1/platform-admin/staff')
      .set(auth(adminToken))
      .send({
        fullName: `موظف مالية ${id}`,
        email: financeEmail,
        password: 'StaffPass123',
        role: 'finance',
      })
      .expect(201);
    const financeLogin = await request(server)
      .post('/api/v1/platform-admin/auth/login')
      .send({ email: financeEmail, password: 'StaffPass123' })
      .expect(200);
    const financeToken = financeLogin.body.accessToken as string;

    await request(server)
      .post('/api/v1/platform-admin/companies')
      .set(auth(financeToken))
      .send({
        legalName: `متجر أنشأه المالية ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `finance-created-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
      })
      .expect(201);
    await request(server).get('/api/v1/platform-admin/plans').set(auth(financeToken)).expect(403);
    await request(server)
      .get('/api/v1/platform-admin/applications')
      .set(auth(financeToken))
      .expect(403);
  });

  // ---------------------------------------------------------------------
  // Scenario F: duplicate email/mobile rejected safely + expired-trial access change
  // ---------------------------------------------------------------------
  it('السيناريو و: رفض البريد الإلكتروني/الجوال المكرر دون تسريب وجود الحساب، وتغيّر الصلاحيات عند انتهاء التجربة', async () => {
    const id = unique();
    const ownerEmail = `scenario-f-${id}@test.qeedha.local`;
    const ownerMobile = `05${id}`;

    const first = await registerCompany({
      legalName: `متجر و1 ${id}`,
      ownerFullName: `مالك و ${id}`,
      ownerEmail,
      ownerMobile,
      password: 'SuperSecret123',
    }).expect(201);

    // Same email, different everything else - rejected, and the message
    // must not confirm which field collided or reveal it belongs to an
    // existing account by name/id.
    const dupEmail = await registerCompany({
      legalName: `متجر و2 ${id}`,
      ownerFullName: `شخص آخر`,
      ownerEmail,
      password: 'AnotherPass123',
    }).expect(409);
    expect(JSON.stringify(dupEmail.body)).not.toContain(first.body.company.id);
    expect(JSON.stringify(dupEmail.body)).not.toContain(ownerMobile);

    // Same mobile, different email - also rejected.
    await registerCompany({
      legalName: `متجر و3 ${id}`,
      ownerFullName: `شخص ثالث`,
      ownerMobile,
      password: 'ThirdPass123',
    }).expect(409);

    // Expired-trial access change: mutating tenant routes blocked, reads stay available.
    const companyId = first.body.company.id as string;
    const ownerToken = first.body.accessToken as string;

    await request(server)
      .post('/api/v1/catalog/units')
      .set(auth(ownerToken))
      .send({ name: `وحدة ${id}` })
      .expect(201);

    const adminToken = await adminLogin();
    await request(server)
      .post(`/api/v1/platform-admin/companies/${companyId}/subscription/status`)
      .set(auth(adminToken))
      .send({ status: 'expired' })
      .expect(200);

    await request(server)
      .post('/api/v1/catalog/units')
      .set(auth(ownerToken))
      .send({ name: `وحدة أخرى ${id}` })
      .expect(403);
    // Reads must stay available for an expired tenant.
    await request(server).get('/api/v1/catalog/units').set(auth(ownerToken)).expect(200);
    await request(server).get('/api/v1/auth/me').set(auth(ownerToken)).expect(200);
  });
});
