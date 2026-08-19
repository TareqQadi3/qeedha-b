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
 * The SaaS admin control panel (docs/DOMAIN_MODEL.md "Platform admin"): a
 * completely separate actor type from the tenant User/Membership model,
 * with its own login/JWT/guard, that can create merchant companies on
 * their behalf. Requires PLATFORM_ADMIN_SEED_EMAIL/PASSWORD to be set
 * (they are, in .env.test) so prisma/seed.ts bootstraps the one admin
 * these tests log in as.
 */
describe('Platform admin control panel (e2e)', () => {
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

  const adminLogin = (password = ADMIN_PASSWORD) =>
    request(server)
      .post('/api/v1/platform-admin/auth/login')
      .send({ email: ADMIN_EMAIL, password });

  it('يسجّل مدير المنصة الدخول ويحصل على رمز وصول خاص بلوحة التحكم', async () => {
    const res = await adminLogin().expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.admin.email).toBe(ADMIN_EMAIL);

    const me = await request(server)
      .get('/api/v1/platform-admin/auth/me')
      .set(auth(res.body.accessToken))
      .expect(200);
    expect(me.body.email).toBe(ADMIN_EMAIL);
  });

  it('يرفض بيانات دخول خاطئة لمدير المنصة', async () => {
    await adminLogin('WrongPassword123').expect(401);
  });

  it('رمز وصول تاجر عادي (Membership) لا يُقبل إطلاقًا في مسارات لوحة تحكم المنصة', async () => {
    const id = unique();
    const merchant = await request(server)
      .post('/api/v1/auth/register-company')
      .send({
        legalName: `متجر ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `admin-boundary-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
      })
      .expect(201);

    await request(server)
      .get('/api/v1/platform-admin/companies')
      .set(auth(merchant.body.accessToken))
      .expect(401);
  });

  it('مدير المنصة ينشئ منشأة تاجر جديدة، تظهر في قائمة كل المنشآت، ويستطيع التاجر نفسه تسجيل الدخول فورًا بالبيانات التي أدخلها المدير', async () => {
    const login = await adminLogin().expect(200);
    const adminToken = login.body.accessToken;

    const id = unique();
    const ownerEmail = `admin-created-${id}@test.qeedha.local`;
    const created = await request(server)
      .post('/api/v1/platform-admin/companies')
      .set(auth(adminToken))
      .send({
        legalName: `متجر أنشأه المدير ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail,
        password: 'OwnerPassword123',
      })
      .expect(201);

    expect(created.body.company.id).toEqual(expect.any(String));
    expect(created.body.owner.email).toBe(ownerEmail);
    // Never issues a session for the admin's own token to act as the owner.
    expect(created.body.accessToken).toBeUndefined();

    const list = await request(server)
      .get('/api/v1/platform-admin/companies')
      .set(auth(adminToken))
      .expect(200);
    const listedCompany = list.body.find((c: any) => c.id === created.body.company.id);
    expect(listedCompany?.legalName).toBe(`متجر أنشأه المدير ${id}`);

    // The merchant logs in themselves with exactly the credentials the
    // admin set up - no separate activation step.
    const ownerLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: ownerEmail, password: 'OwnerPassword123' })
      .expect(200);
    expect(ownerLogin.body.activeTenant.companyId).toBe(created.body.company.id);

    const me = await request(server)
      .get('/api/v1/auth/me')
      .set(auth(ownerLogin.body.accessToken))
      .expect(200);
    expect(me.body.roles.some((r: any) => r.name === 'Owner')).toBe(true);
  });

  it('لا يقبل أي مسار محمي في لوحة تحكم المنصة طلبًا بلا رمز وصول إطلاقًا', async () => {
    await request(server).get('/api/v1/platform-admin/companies').expect(401);
    await request(server).post('/api/v1/platform-admin/companies').send({}).expect(401);
  });
});
