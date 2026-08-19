import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const unique = () => randomUUID().slice(0, 8);

/**
 * Team accounts (username + password, no email/mobile required): a
 * merchant creating a Cashier/Accountant needs only a name, a username,
 * a password, and a role - see docs/DOMAIN_MODEL.md "Team accounts".
 * Login accepts email, mobile, OR username as `identifier`.
 */
describe('Team accounts: username-based creation and login (e2e)', () => {
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
        legalName: `متجر فريق ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `team-owner-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
      })
      .expect(201);
    return { id, accessToken: res.body.accessToken as string };
  };

  const getRoleId = async (token: string, name: string) => {
    const roles = await request(server).get('/api/v1/iam/roles').set(auth(token)).expect(200);
    const role = roles.body.find((r: any) => r.name === name);
    if (!role) throw new Error(`role not found: ${name}`);
    return role.id as string;
  };

  it('التاجر ينشئ حساب نقطة بيع باسم مستخدم وكلمة مرور فقط (بلا بريد/جوال)، ويستطيع الموظف الدخول باسم المستخدم', async () => {
    const owner = await registerTenant();
    const cashierRoleId = await getRoleId(owner.accessToken, 'Cashier');
    const username = `cashier-${unique()}`;

    const created = await request(server)
      .post('/api/v1/iam/users')
      .set(auth(owner.accessToken))
      .send({
        fullName: 'كاشير تجريبي',
        username,
        password: 'CashierPass123',
        roleId: cashierRoleId,
      })
      .expect(201);

    expect(created.body.user.email).toBeNull();
    expect(created.body.user.mobile).toBeNull();
    expect(created.body.user.username).toBe(username);
    // passwordHash must never leave the API, under any identifier shape.
    expect(created.body.user.passwordHash).toBeUndefined();

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: username, password: 'CashierPass123' })
      .expect(200);

    expect(login.body.user.username).toBe(username);

    const me = await request(server)
      .get('/api/v1/auth/me')
      .set(auth(login.body.accessToken))
      .expect(200);
    expect(me.body.roles.some((r: any) => r.name === 'Cashier')).toBe(true);
  });

  it('التاجر ينشئ حساب محاسب باسم مستخدم، وصلاحياته تختلف عن الكاشير (محاسب يرى الحسابات، كاشير لا يستطيع)', async () => {
    const owner = await registerTenant();
    const accountantRoleId = await getRoleId(owner.accessToken, 'Accountant');
    const cashierRoleId = await getRoleId(owner.accessToken, 'Cashier');

    const accountantUsername = `accountant-${unique()}`;
    await request(server)
      .post('/api/v1/iam/users')
      .set(auth(owner.accessToken))
      .send({
        fullName: 'محاسب تجريبي',
        username: accountantUsername,
        password: 'AccountantPass123',
        roleId: accountantRoleId,
      })
      .expect(201);
    const cashierUsername = `cashier-${unique()}`;
    await request(server)
      .post('/api/v1/iam/users')
      .set(auth(owner.accessToken))
      .send({
        fullName: 'كاشير تجريبي 2',
        username: cashierUsername,
        password: 'CashierPass123',
        roleId: cashierRoleId,
      })
      .expect(201);

    const accountantLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: accountantUsername, password: 'AccountantPass123' })
      .expect(200);
    const cashierLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: cashierUsername, password: 'CashierPass123' })
      .expect(200);

    await request(server)
      .get('/api/v1/accounting/accounts')
      .set(auth(accountantLogin.body.accessToken))
      .expect(200);

    await request(server)
      .get('/api/v1/accounting/accounts')
      .set(auth(cashierLogin.body.accessToken))
      .expect(403);
  });

  it('اسم مستخدم مكرر بين منشأتين مختلفتين يُرفض بدل أن يُلحِق الموظف الجديد بحساب المستخدم الآخر', async () => {
    const ownerA = await registerTenant();
    const ownerB = await registerTenant();
    const cashierRoleA = await getRoleId(ownerA.accessToken, 'Cashier');
    const cashierRoleB = await getRoleId(ownerB.accessToken, 'Cashier');
    const sharedUsername = `shared-${unique()}`;

    await request(server)
      .post('/api/v1/iam/users')
      .set(auth(ownerA.accessToken))
      .send({
        fullName: 'موظف منشأة أ',
        username: sharedUsername,
        password: 'PasswordA123',
        roleId: cashierRoleA,
      })
      .expect(201);

    // Company B's merchant picks the exact same username for a different
    // real person - must be rejected, never silently attached to Company
    // A's employee account (that would leak Company A's employee into
    // Company B and let either password log into a Membership meant for
    // someone else entirely).
    await request(server)
      .post('/api/v1/iam/users')
      .set(auth(ownerB.accessToken))
      .send({
        fullName: 'موظف منشأة ب',
        username: sharedUsername,
        password: 'PasswordB123',
        roleId: cashierRoleB,
      })
      .expect(409);
  });

  it('لا يجوز إنشاء حساب فريق بلا أي مُعرِّف إطلاقًا (لا بريد ولا جوال ولا اسم مستخدم)', async () => {
    const owner = await registerTenant();
    const cashierRoleId = await getRoleId(owner.accessToken, 'Cashier');

    await request(server)
      .post('/api/v1/iam/users')
      .set(auth(owner.accessToken))
      .send({ fullName: 'بلا معرّف', password: 'SomePass123', roleId: cashierRoleId })
      .expect(400);
  });
});
