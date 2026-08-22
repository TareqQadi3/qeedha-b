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
    return {
      id,
      accessToken: res.body.accessToken as string,
      subscriptionNumber: res.body.company.subscriptionNumber as number,
    };
  };

  /** The MAIN branch every registerTenant() company gets automatically - needed for employeeLogin(). */
  const getMainBranchId = async (token: string) => {
    const branches = await request(server)
      .get('/api/v1/tenancy/branches')
      .set(auth(token))
      .expect(200);
    const branch = branches.body.find((b: any) => b.code === 'MAIN');
    if (!branch) throw new Error('MAIN branch not found');
    return branch.id as string;
  };

  const getRoleId = async (token: string, name: string) => {
    const roles = await request(server).get('/api/v1/iam/roles').set(auth(token)).expect(200);
    const role = roles.body.find((r: any) => r.name === name);
    if (!role) throw new Error(`role not found: ${name}`);
    return role.id as string;
  };

  it('التاجر ينشئ حساب نقطة بيع باسم مستخدم وكلمة مرور فقط (بلا بريد/جوال)، ويستطيع الموظف الدخول برقم الاشتراك + الفرع + اسم المستخدم', async () => {
    const owner = await registerTenant();
    const branchId = await getMainBranchId(owner.accessToken);
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

    // Phase 12: username-based accounts no longer resolve through the
    // owner-facing /auth/login (identifier could collide across companies
    // now that username is scoped, not global) - employees use the
    // dedicated employee-login flow instead.
    await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: username, password: 'CashierPass123' })
      .expect(401);

    const login = await request(server)
      .post('/api/v1/auth/employee-login')
      .send({
        subscriptionNumber: owner.subscriptionNumber,
        branchId,
        username,
        password: 'CashierPass123',
      })
      .expect(200);

    expect(login.body.user.username).toBe(username);
    expect(login.body.branch.id).toBe(branchId);

    const me = await request(server)
      .get('/api/v1/auth/me')
      .set(auth(login.body.accessToken))
      .expect(200);
    expect(me.body.roles.some((r: any) => r.name === 'Cashier')).toBe(true);
  });

  it('التاجر ينشئ حساب محاسب باسم مستخدم، وصلاحياته تختلف عن الكاشير (محاسب يرى الحسابات، كاشير لا يستطيع)', async () => {
    const owner = await registerTenant();
    const branchId = await getMainBranchId(owner.accessToken);
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
      .post('/api/v1/auth/employee-login')
      .send({
        subscriptionNumber: owner.subscriptionNumber,
        branchId,
        username: accountantUsername,
        password: 'AccountantPass123',
      })
      .expect(200);
    const cashierLogin = await request(server)
      .post('/api/v1/auth/employee-login')
      .send({
        subscriptionNumber: owner.subscriptionNumber,
        branchId,
        username: cashierUsername,
        password: 'CashierPass123',
      })
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

  it('اسم مستخدم مكرر بين منشأتين مختلفتين مسموح الآن (معزول برقم الاشتراك)، وكل موظف يدخل على منشأته فقط', async () => {
    const ownerA = await registerTenant();
    const ownerB = await registerTenant();
    const branchIdA = await getMainBranchId(ownerA.accessToken);
    const branchIdB = await getMainBranchId(ownerB.accessToken);
    const cashierRoleA = await getRoleId(ownerA.accessToken, 'Cashier');
    const cashierRoleB = await getRoleId(ownerB.accessToken, 'Cashier');
    const sharedUsername = `shared-${unique()}`;

    // Phase 12: this is exactly the scenario the old global
    // @@unique([username]) used to reject with 409 - two unrelated
    // companies each independently naming an employee "shared-xxxx" is a
    // completely normal, unrelated coincidence and must succeed for both.
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

    await request(server)
      .post('/api/v1/iam/users')
      .set(auth(ownerB.accessToken))
      .send({
        fullName: 'موظف منشأة ب',
        username: sharedUsername,
        password: 'PasswordB123',
        roleId: cashierRoleB,
      })
      .expect(201);

    // Each logs in through THEIR OWN company's subscriptionNumber and gets
    // exactly their own account - never each other's, and never a wrong
    // password from the other company accidentally validating.
    const loginA = await request(server)
      .post('/api/v1/auth/employee-login')
      .send({
        subscriptionNumber: ownerA.subscriptionNumber,
        branchId: branchIdA,
        username: sharedUsername,
        password: 'PasswordA123',
      })
      .expect(200);
    const loginB = await request(server)
      .post('/api/v1/auth/employee-login')
      .send({
        subscriptionNumber: ownerB.subscriptionNumber,
        branchId: branchIdB,
        username: sharedUsername,
        password: 'PasswordB123',
      })
      .expect(200);
    expect(loginA.body.user.id).not.toBe(loginB.body.user.id);

    // Company A's employee password must NOT work against Company B's
    // same-named account, and vice versa.
    await request(server)
      .post('/api/v1/auth/employee-login')
      .send({
        subscriptionNumber: ownerB.subscriptionNumber,
        branchId: branchIdB,
        username: sharedUsername,
        password: 'PasswordA123',
      })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/employee-login')
      .send({
        subscriptionNumber: ownerA.subscriptionNumber,
        branchId: branchIdA,
        username: sharedUsername,
        password: 'PasswordB123',
      })
      .expect(401);
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
