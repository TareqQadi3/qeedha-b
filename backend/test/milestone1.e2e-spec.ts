import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ACCOUNT_CODES } from '../src/modules/accounting/constants/default-chart-of-accounts';

const unique = () => randomUUID().slice(0, 8);

describe('Milestone 1: Accounting Completion (e2e)', () => {
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
        legalName: `متجر محاسبة ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `m1owner-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
      })
      .expect(201);

    const warehouses = await request(server)
      .get('/api/v1/tenancy/warehouses')
      .set(auth(res.body.accessToken))
      .expect(200);
    const branches = await request(server)
      .get('/api/v1/tenancy/branches')
      .set(auth(res.body.accessToken))
      .expect(200);

    return {
      id,
      accessToken: res.body.accessToken as string,
      companyId: res.body.company.id as string,
      warehouseId: warehouses.body[0].id as string,
      branchId: branches.body.find((b: any) => b.isDefault).id as string,
    };
  };

  type Tenant = Awaited<ReturnType<typeof registerTenant>>;

  const createProduct = async (tenant: Tenant, overrides: any = {}) => {
    const res = await request(server)
      .post('/api/v1/products')
      .set(auth(tenant.accessToken))
      .send({
        sku: `SKU-${unique()}`,
        name: `منتج ${unique()}`,
        costPrice: 5,
        sellingPrice: 10,
        ...overrides,
      })
      .expect(201);
    return res.body;
  };

  const createSupplier = async (tenant: Tenant) => {
    const res = await request(server)
      .post('/api/v1/suppliers')
      .set(auth(tenant.accessToken))
      .send({ name: `مورد ${unique()}` })
      .expect(201);
    return res.body;
  };

  const createCustomer = async (tenant: Tenant) => {
    const res = await request(server)
      .post('/api/v1/customers')
      .set(auth(tenant.accessToken))
      .send({ name: `عميل ${unique()}` })
      .expect(201);
    return res.body;
  };

  const getRoleId = async (token: string, name: string) => {
    const roles = await request(server).get('/api/v1/iam/roles').set(auth(token)).expect(200);
    const role = roles.body.find((r: any) => r.name === name);
    if (!role) throw new Error(`role not found: ${name}`);
    return role.id as string;
  };

  const createBranch = async (token: string) => {
    const id = unique();
    const res = await request(server)
      .post('/api/v1/tenancy/branches')
      .set(auth(token))
      .send({ name: `فرع ${id}`, code: `BR-${id}` })
      .expect(201);
    return res.body;
  };

  const createWarehouse = async (token: string, branchId: string) => {
    const id = unique();
    const res = await request(server)
      .post('/api/v1/tenancy/warehouses')
      .set(auth(token))
      .send({ branchId, name: `مستودع ${id}`, code: `WH-${id}` })
      .expect(201);
    return res.body;
  };

  const createScopedUser = async (tenant: Tenant, roleName: string, branchId: string | null) => {
    const roleId = await getRoleId(tenant.accessToken, roleName);
    const email = `scoped-${unique()}@test.qeedha.local`;
    const password = 'ScopedPass123';
    const created = await request(server)
      .post('/api/v1/iam/users')
      .set(auth(tenant.accessToken))
      .send({
        fullName: 'عضو مقيّد',
        email,
        password,
        roleId,
        ...(branchId ? { branchId } : {}),
      })
      .expect(201);
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: email, password })
      .expect(200);
    return {
      userId: created.body.user.id as string,
      accessToken: login.body.accessToken as string,
    };
  };

  const getAccounts = async (tenant: Tenant) => {
    const res = await request(server)
      .get('/api/v1/accounting/accounts')
      .set(auth(tenant.accessToken))
      .expect(200);
    return res.body as any[];
  };

  const findAccount = (accounts: any[], code: string) => accounts.find((a) => a.code === code);

  const createAndReceivePurchase = async (
    tenant: Tenant,
    supplierId: string,
    productId: string,
    quantity: number,
    unitCost: number,
    warehouseId = tenant.warehouseId,
  ) => {
    const created = await request(server)
      .post('/api/v1/purchases')
      .set(auth(tenant.accessToken))
      .send({
        warehouseId,
        supplierId,
        items: [{ productId, quantity, unitCost }],
        clientReferenceId: unique(),
      })
      .expect(201);
    const received = await request(server)
      .post(`/api/v1/purchases/${created.body.id}/receive`)
      .set(auth(tenant.accessToken))
      .expect(201);
    return received.body;
  };

  const setOpeningStock = async (
    tenant: Tenant,
    productId: string,
    quantity: number,
    warehouseId = tenant.warehouseId,
  ) => {
    await request(server)
      .post('/api/v1/inventory/opening-balance')
      .set(auth(tenant.accessToken))
      .send({ warehouseId, productId, quantity })
      .expect(201);
  };

  const createSale = async (
    tenant: Tenant,
    productId: string,
    quantity: number,
    amount: number,
    warehouseId = tenant.warehouseId,
    customerId?: string,
  ) => {
    const res = await request(server)
      .post('/api/v1/sales')
      .set(auth(tenant.accessToken))
      .send({
        warehouseId,
        items: [{ productId, quantity }],
        payments: [{ method: 'cash', amount }],
        clientReferenceId: unique(),
        ...(customerId ? { customerId } : {}),
      })
      .expect(201);
    return res.body;
  };

  const createExpense = async (tenant: Tenant, amount: number, branchId?: string) => {
    const categories = await request(server)
      .get('/api/v1/expenses/categories')
      .set(auth(tenant.accessToken))
      .expect(200);
    const res = await request(server)
      .post('/api/v1/expenses')
      .set(auth(tenant.accessToken))
      .send({
        categoryId: categories.body[0].id,
        amount,
        paymentMethod: 'cash',
        clientReferenceId: unique(),
        ...(branchId ? { branchId } : {}),
      })
      .expect(201);
    return res.body;
  };

  // ---------------------------------------------------------------------------
  // Trial Balance
  // ---------------------------------------------------------------------------

  describe('ميزان المراجعة (Trial Balance)', () => {
    it('يعرض ميزانًا متوازنًا (مدين = دائن) بعد بيع ومصروف', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 100);
      await createSale(tenant, product.id, 2, 23);
      await createExpense(tenant, 40);

      const res = await request(server)
        .get('/api/v1/accounting/reports/trial-balance')
        .set(auth(tenant.accessToken))
        .expect(200);

      expect(res.body.totals.isBalanced).toBe(true);
      expect(res.body.totals.totalDebit).toBe(res.body.totals.totalCredit);
      const cashRow = res.body.rows.find((r: any) => r.accountCode === ACCOUNT_CODES.CASH);
      expect(cashRow).toBeTruthy();
      // 23 (sale, cash in) - 40 (expense, cash out) = -17 net debit balance
      expect(cashRow.netBalance).toBe(-17);
    });

    it('نطاق التاريخ (dateFrom/dateTo) يُقصي القيود خارج المدى', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 100);
      await createSale(tenant, product.id, 1, 11.5);

      const future = new Date();
      future.setDate(future.getDate() + 2);
      const dateFrom = future.toISOString().slice(0, 10);

      const res = await request(server)
        .get('/api/v1/accounting/reports/trial-balance')
        .query({ dateFrom })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(res.body.rows).toHaveLength(0);
    });

    it('عضو بلا صلاحية accounting.reports.view يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const cashier = await createScopedUser(tenant, 'Cashier', null);
      await request(server)
        .get('/api/v1/accounting/reports/trial-balance')
        .set(auth(cashier.accessToken))
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // General Ledger
  // ---------------------------------------------------------------------------

  describe('دفتر الأستاذ (General Ledger)', () => {
    it('يعرض حركات حساب معيّن برصيد جارٍ صحيح', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 100);
      await createSale(tenant, product.id, 1, 11.5);
      await createExpense(tenant, 5);

      const accounts = await getAccounts(tenant);
      const cash = findAccount(accounts, ACCOUNT_CODES.CASH);

      const res = await request(server)
        .get('/api/v1/accounting/reports/general-ledger')
        .query({ accountId: cash.id })
        .set(auth(tenant.accessToken))
        .expect(200);

      expect(res.body.lines.length).toBe(2);
      expect(res.body.closingBalance).toBe(6.5); // +11.5 - 5
      expect(res.body.lines[res.body.lines.length - 1].runningBalance).toBe(6.5);
    });

    it('حساب من منشأة أخرى يُرفض بـ404 (IDOR)', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const accountsB = await getAccounts(tenantB);
      const cashB = findAccount(accountsB, ACCOUNT_CODES.CASH);

      await request(server)
        .get('/api/v1/accounting/reports/general-ledger')
        .query({ accountId: cashB.id })
        .set(auth(tenantA.accessToken))
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Profit & Loss / Balance Sheet
  // ---------------------------------------------------------------------------

  describe('الأرباح والخسائر والميزانية العمومية (P&L / Balance Sheet)', () => {
    it('صافي الربح = الإيرادات - المصروفات، ويظهر كبند أرباح غير مقفلة متوازن في الميزانية العمومية', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 100);
      await createSale(tenant, product.id, 2, 23); // revenueNet = 20, tax = 3
      await createExpense(tenant, 8);

      const pl = await request(server)
        .get('/api/v1/accounting/reports/profit-and-loss')
        .set(auth(tenant.accessToken))
        .expect(200);
      // Milestone 6: the sale now also posts COGS (2 units x costPrice 5,
      // the opening-stock fallback cost, since setOpeningStock here passes
      // no unitCost) = 10, on top of the manual expense (8).
      expect(pl.body.totalRevenue).toBe(20);
      expect(pl.body.costOfGoodsSold).toBe(10);
      expect(pl.body.grossProfit).toBe(10);
      expect(pl.body.totalExpense).toBe(18);
      expect(pl.body.netProfit).toBe(2);

      const bs = await request(server)
        .get('/api/v1/accounting/reports/balance-sheet')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(bs.body.totals.isBalanced).toBe(true);
      const retainedEarnings = bs.body.equity.find((e: any) => e.computed);
      expect(retainedEarnings.balance).toBe(2);
    });

    it('عضو بلا صلاحية accounting.reports.view يُرفض بـ403 على كلا التقريرين', async () => {
      const tenant = await registerTenant();
      const cashier = await createScopedUser(tenant, 'Cashier', null);
      await request(server)
        .get('/api/v1/accounting/reports/profit-and-loss')
        .set(auth(cashier.accessToken))
        .expect(403);
      await request(server)
        .get('/api/v1/accounting/reports/balance-sheet')
        .set(auth(cashier.accessToken))
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // AR / AP Subledgers
  // ---------------------------------------------------------------------------

  describe('ذمم العملاء والموردين (AR/AP Subledger)', () => {
    it('AR يعود فارغًا هيكليًا اليوم - لا يوجد بيع آجل في النظام (قيد موثَّق، وليس خطأ)', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const customer = await createCustomer(tenant);
      await setOpeningStock(tenant, product.id, 100);
      await createSale(tenant, product.id, 1, 11.5, tenant.warehouseId, customer.id);

      const res = await request(server)
        .get('/api/v1/accounting/ar/customers')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('AP يعرض رصيدًا صحيحًا لكل مورد بعد استلام مشتريات، وكشف حساب مفصّل', async () => {
      const tenant = await registerTenant();
      const supplier = await createSupplier(tenant);
      const product = await createProduct(tenant);
      await createAndReceivePurchase(tenant, supplier.id, product.id, 10, 8); // total 92 (80+12 tax)

      const list = await request(server)
        .get('/api/v1/accounting/ap/suppliers')
        .set(auth(tenant.accessToken))
        .expect(200);
      const row = list.body.find((s: any) => s.supplierId === supplier.id);
      expect(row.balance).toBe(92);

      const statement = await request(server)
        .get(`/api/v1/accounting/ap/suppliers/${supplier.id}`)
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(statement.body.balance).toBe(92);
      expect(statement.body.transactions).toHaveLength(1);
    });

    it('كشف حساب مورد من منشأة أخرى يُرفض بـ404 (IDOR)', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const supplierB = await createSupplier(tenantB);

      await request(server)
        .get(`/api/v1/accounting/ap/suppliers/${supplierB.id}`)
        .set(auth(tenantA.accessToken))
        .expect(404);
    });

    it('عضو بلا صلاحية accounting.ar.view/ap.view يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const cashier = await createScopedUser(tenant, 'Cashier', null);
      await request(server)
        .get('/api/v1/accounting/ar/customers')
        .set(auth(cashier.accessToken))
        .expect(403);
      await request(server)
        .get('/api/v1/accounting/ap/suppliers')
        .set(auth(cashier.accessToken))
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Opening Balances
  // ---------------------------------------------------------------------------

  describe('الأرصدة الافتتاحية (Opening Balances)', () => {
    it('تسجيل رصيد افتتاحي متوازن ينجح، ولا يمكن تسجيل آخر قبل عكسه', async () => {
      const tenant = await registerTenant();
      const accounts = await getAccounts(tenant);
      const cash = findAccount(accounts, ACCOUNT_CODES.CASH);
      const equity = findAccount(accounts, ACCOUNT_CODES.OWNER_EQUITY);

      const created = await request(server)
        .post('/api/v1/accounting/opening-balance')
        .set(auth(tenant.accessToken))
        .send({
          lines: [
            { accountId: cash.id, debit: 1000 },
            { accountId: equity.id, credit: 1000 },
          ],
        })
        .expect(201);
      expect(created.body.referenceType).toBe('OpeningBalance');

      const fetched = await request(server)
        .get('/api/v1/accounting/opening-balance')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(fetched.body.id).toBe(created.body.id);

      const audit = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findFirst({
          where: {
            companyId: tenant.companyId,
            action: 'accounting.opening_balance.create',
            entityId: created.body.id,
          },
        }),
      );
      expect(audit).not.toBeNull();

      await request(server)
        .post('/api/v1/accounting/opening-balance')
        .set(auth(tenant.accessToken))
        .send({
          lines: [
            { accountId: cash.id, debit: 500 },
            { accountId: equity.id, credit: 500 },
          ],
        })
        .expect(409);
    });

    it('رصيد افتتاحي غير متوازن يُرفض بـ422', async () => {
      const tenant = await registerTenant();
      const accounts = await getAccounts(tenant);
      const cash = findAccount(accounts, ACCOUNT_CODES.CASH);
      const equity = findAccount(accounts, ACCOUNT_CODES.OWNER_EQUITY);

      await request(server)
        .post('/api/v1/accounting/opening-balance')
        .set(auth(tenant.accessToken))
        .send({
          lines: [
            { accountId: cash.id, debit: 1000 },
            { accountId: equity.id, credit: 900 },
          ],
        })
        .expect(422);
    });

    it('عكس الرصيد الافتتاحي يسمح بتسجيل رصيد جديد؛ عكسه بلا رصيد نشط يُرفض بـ404', async () => {
      const tenant = await registerTenant();
      const accounts = await getAccounts(tenant);
      const cash = findAccount(accounts, ACCOUNT_CODES.CASH);
      const equity = findAccount(accounts, ACCOUNT_CODES.OWNER_EQUITY);

      await request(server)
        .post('/api/v1/accounting/opening-balance')
        .set(auth(tenant.accessToken))
        .send({
          lines: [
            { accountId: cash.id, debit: 1000 },
            { accountId: equity.id, credit: 1000 },
          ],
        })
        .expect(201);

      await request(server)
        .post('/api/v1/accounting/opening-balance/reverse')
        .set(auth(tenant.accessToken))
        .expect(201);

      await request(server)
        .post('/api/v1/accounting/opening-balance/reverse')
        .set(auth(tenant.accessToken))
        .expect(404);

      await request(server)
        .post('/api/v1/accounting/opening-balance')
        .set(auth(tenant.accessToken))
        .send({
          lines: [
            { accountId: cash.id, debit: 700 },
            { accountId: equity.id, credit: 700 },
          ],
        })
        .expect(201);
    });

    it('طلبان متزامنان حقيقيان لتسجيل رصيد افتتاحي - واحد فقط ينجح', async () => {
      const tenant = await registerTenant();
      const accounts = await getAccounts(tenant);
      const cash = findAccount(accounts, ACCOUNT_CODES.CASH);
      const equity = findAccount(accounts, ACCOUNT_CODES.OWNER_EQUITY);
      const body = {
        lines: [
          { accountId: cash.id, debit: 300 },
          { accountId: equity.id, credit: 300 },
        ],
      };

      const [resA, resB] = await Promise.all([
        request(server)
          .post('/api/v1/accounting/opening-balance')
          .set(auth(tenant.accessToken))
          .send(body),
        request(server)
          .post('/api/v1/accounting/opening-balance')
          .set(auth(tenant.accessToken))
          .send(body),
      ]);
      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const count = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.journalEntry.count({
          where: { companyId: tenant.companyId, referenceType: 'OpeningBalance', status: 'posted' },
        }),
      );
      expect(count).toBe(1);
    });

    it('عضو بلا صلاحية accounting.opening_balance.manage يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const accounts = await getAccounts(tenant);
      const cash = findAccount(accounts, ACCOUNT_CODES.CASH);
      const equity = findAccount(accounts, ACCOUNT_CODES.OWNER_EQUITY);
      const cashier = await createScopedUser(tenant, 'Cashier', null);

      await request(server)
        .post('/api/v1/accounting/opening-balance')
        .set(auth(cashier.accessToken))
        .send({
          lines: [
            { accountId: cash.id, debit: 100 },
            { accountId: equity.id, credit: 100 },
          ],
        })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Fiscal Periods
  // ---------------------------------------------------------------------------

  describe('الفترات المحاسبية (Fiscal Periods)', () => {
    const todayRange = () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      return { startDate: iso(start), endDate: iso(end) };
    };

    it('إنشاء فترة، وفترة متقاطعة معها تُرفض بـ409، وتاريخ بداية بعد النهاية يُرفض بـ400', async () => {
      const tenant = await registerTenant();
      const { startDate, endDate } = todayRange();

      const created = await request(server)
        .post('/api/v1/accounting/fiscal-periods')
        .set(auth(tenant.accessToken))
        .send({ name: 'الشهر الحالي', startDate, endDate })
        .expect(201);
      expect(created.body.status).toBe('open');

      await request(server)
        .post('/api/v1/accounting/fiscal-periods')
        .set(auth(tenant.accessToken))
        .send({ name: 'فترة متقاطعة', startDate, endDate })
        .expect(409);

      await request(server)
        .post('/api/v1/accounting/fiscal-periods')
        .set(auth(tenant.accessToken))
        .send({ name: 'فترة غير منطقية', startDate: endDate, endDate: startDate })
        .expect(400);
    });

    it('إقفال الفترة الحالية يمنع ترحيل قيود جديدة (مصروف يُرفض بـ409)؛ إعادة الفتح تسمح مجددًا', async () => {
      const tenant = await registerTenant();
      const { startDate, endDate } = todayRange();

      const period = await request(server)
        .post('/api/v1/accounting/fiscal-periods')
        .set(auth(tenant.accessToken))
        .send({ name: 'فترة للإقفال', startDate, endDate })
        .expect(201);

      await request(server)
        .post(`/api/v1/accounting/fiscal-periods/${period.body.id}/close`)
        .set(auth(tenant.accessToken))
        .expect(201);

      const closeAudit = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findFirst({
          where: {
            companyId: tenant.companyId,
            action: 'accounting.period.close',
            entityId: period.body.id,
          },
        }),
      );
      expect(closeAudit).not.toBeNull();

      const categories = await request(server)
        .get('/api/v1/expenses/categories')
        .set(auth(tenant.accessToken))
        .expect(200);
      await request(server)
        .post('/api/v1/expenses')
        .set(auth(tenant.accessToken))
        .send({
          categoryId: categories.body[0].id,
          amount: 15,
          paymentMethod: 'cash',
          clientReferenceId: unique(),
        })
        .expect(409);

      await request(server)
        .post(`/api/v1/accounting/fiscal-periods/${period.body.id}/close`)
        .set(auth(tenant.accessToken))
        .expect(409); // already closed

      await request(server)
        .post(`/api/v1/accounting/fiscal-periods/${period.body.id}/reopen`)
        .set(auth(tenant.accessToken))
        .expect(201);

      await request(server)
        .post('/api/v1/expenses')
        .set(auth(tenant.accessToken))
        .send({
          categoryId: categories.body[0].id,
          amount: 15,
          paymentMethod: 'cash',
          clientReferenceId: unique(),
        })
        .expect(201);

      await request(server)
        .post(`/api/v1/accounting/fiscal-periods/${period.body.id}/reopen`)
        .set(auth(tenant.accessToken))
        .expect(409); // already open
    });

    it('فترة محاسبية من منشأة أخرى يُرفض إقفالها بـ404 (IDOR)', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const { startDate, endDate } = todayRange();
      const periodB = await request(server)
        .post('/api/v1/accounting/fiscal-periods')
        .set(auth(tenantB.accessToken))
        .send({ name: 'فترة ب', startDate, endDate })
        .expect(201);

      await request(server)
        .post(`/api/v1/accounting/fiscal-periods/${periodB.body.id}/close`)
        .set(auth(tenantA.accessToken))
        .expect(404);
    });

    it('عضو بلا صلاحية accounting.period.manage يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const cashier = await createScopedUser(tenant, 'Cashier', null);
      const { startDate, endDate } = todayRange();
      await request(server)
        .post('/api/v1/accounting/fiscal-periods')
        .set(auth(cashier.accessToken))
        .send({ name: 'محاولة', startDate, endDate })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Branch scope on reports
  // ---------------------------------------------------------------------------

  describe('نطاق الفروع في التقارير (Branch scope)', () => {
    it('محاسب مقيّد بفرع لا يرى في دفتر الأستاذ إلا حركات فرعه', async () => {
      const tenant = await registerTenant();
      const branch2 = await createBranch(tenant.accessToken);
      const warehouse2 = await createWarehouse(tenant.accessToken, branch2.id);
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 100, tenant.warehouseId);
      await setOpeningStock(tenant, product.id, 100, warehouse2.id);

      await createSale(tenant, product.id, 1, 11.5, tenant.warehouseId); // default branch
      await createSale(tenant, product.id, 1, 11.5, warehouse2.id); // branch2

      const scopedAccountant = await createScopedUser(tenant, 'Accountant', tenant.branchId);
      const accounts = await getAccounts(tenant);
      const cash = findAccount(accounts, ACCOUNT_CODES.CASH);

      const scopedGl = await request(server)
        .get('/api/v1/accounting/reports/general-ledger')
        .query({ accountId: cash.id })
        .set(auth(scopedAccountant.accessToken))
        .expect(200);
      expect(scopedGl.body.lines).toHaveLength(1);

      const ownerGl = await request(server)
        .get('/api/v1/accounting/reports/general-ledger')
        .query({ accountId: cash.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(ownerGl.body.lines).toHaveLength(2);
    });
  });
});
