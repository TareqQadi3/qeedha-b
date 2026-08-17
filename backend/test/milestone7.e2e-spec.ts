import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ACCOUNT_CODES } from '../src/modules/accounting/constants/default-chart-of-accounts';

const unique = () => randomUUID().slice(0, 8);

describe('Milestone 7: Merchant Operations & Business Completion (e2e)', () => {
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
        legalName: `متجر عمليات تجارية ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `m7owner-${id}@test.qeedha.local`,
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
      userId: res.body.user.id as string,
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
        vatRate: 15,
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

  const setOpeningStock = async (
    tenant: Tenant,
    productId: string,
    quantity: number,
    unitCost?: number,
    warehouseId = tenant.warehouseId,
  ) => {
    await request(server)
      .post('/api/v1/inventory/opening-balance')
      .set(auth(tenant.accessToken))
      .send({ warehouseId, productId, quantity, ...(unitCost !== undefined ? { unitCost } : {}) })
      .expect(201);
  };

  const purchaseAndReceive = async (
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

  const createSale = async (
    tenant: Tenant,
    productId: string,
    quantity: number,
    payments: { method: string; amount: number }[],
    customerId?: string,
    warehouseId = tenant.warehouseId,
  ) => {
    const res = await request(server)
      .post('/api/v1/sales')
      .set(auth(tenant.accessToken))
      .send({
        warehouseId,
        items: [{ productId, quantity }],
        payments,
        ...(customerId ? { customerId } : {}),
        clientReferenceId: unique(),
      })
      .expect(201);
    return res.body;
  };

  const getStockLevel = async (
    tenant: Tenant,
    productId: string,
    warehouseId = tenant.warehouseId,
  ) => {
    const res = await request(server)
      .get('/api/v1/inventory/stock-levels')
      .query({ productId, warehouseId })
      .set(auth(tenant.accessToken))
      .expect(200);
    return res.body.data[0];
  };

  const getJournalEntry = async (tenant: Tenant, referenceType: string, referenceId: string) => {
    return prisma.withTenant(tenant.companyId, (tx) =>
      tx.journalEntry.findMany({
        where: { companyId: tenant.companyId, referenceType, referenceId, status: 'posted' },
        include: { lines: { include: { account: true } } },
        orderBy: { postedAt: 'asc' },
      }),
    );
  };

  // ---------------------------------------------------------------------------
  // Customer Credit Sales / AR
  // ---------------------------------------------------------------------------

  describe('البيع الآجل والذمم المدينة (Customer Credit Sales / AR)', () => {
    it('بيع بدون أي دفعة (آجل بالكامل) يتطلب عميلًا، ويُرحَّل بالكامل إلى الذمم المدينة', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const customer = await createCustomer(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);

      const sale = await createSale(tenant, product.id, 2, [], customer.id);
      expect(Number(sale.totalAmount)).toBeCloseTo(23, 2); // 2 x 10 x 1.15

      const entries = await getJournalEntry(tenant, 'Sale', sale.id);
      const arLine = entries[0].lines.find(
        (l) => l.account.code === ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
      );
      expect(Number(arLine!.debit)).toBeCloseTo(23, 2);

      const balances = await request(server)
        .get('/api/v1/accounting/ar/customers')
        .set(auth(tenant.accessToken))
        .expect(200);
      const row = balances.body.find((r: any) => r.customerId === customer.id);
      expect(row.balance).toBeCloseTo(23, 2);
    });

    it('بيع بدفعة جزئية بلا عميل يُرفض بـ400', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 2 }],
          payments: [{ method: 'cash', amount: 5 }], // total is 23, partial payment
          clientReferenceId: unique(),
        })
        .expect(400);
    });

    it('بيع بدفعة أكبر من الإجمالي يُرفض بـ400', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const customer = await createCustomer(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 2 }],
          payments: [{ method: 'cash', amount: 999 }],
          customerId: customer.id,
          clientReferenceId: unique(),
        })
        .expect(400);
    });

    it('تسجيل دفعة على بيع آجل: تُخفّض الرصيد المستحق وتُنشئ قيدًا Dr نقد/Cr ذمم مدينة', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const customer = await createCustomer(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(
        tenant,
        product.id,
        2,
        [{ method: 'cash', amount: 10 }],
        customer.id,
      ); // total 23, paid 10, AR 13

      const payment = await request(server)
        .post(`/api/v1/sales/${sale.id}/payments`)
        .set(auth(tenant.accessToken))
        .send({ method: 'cash', amount: 13, clientReferenceId: unique() })
        .expect(201);
      expect(payment.body.payments).toHaveLength(2);

      const balances = await request(server)
        .get('/api/v1/accounting/ar/customers')
        .set(auth(tenant.accessToken))
        .expect(200);
      const row = balances.body.find((r: any) => r.customerId === customer.id);
      expect(row?.balance ?? 0).toBeCloseTo(0, 2);
    });

    it('محاولة دفع أكثر من الرصيد المستحق تُرفض بـ409 (منع الدفع الزائد)', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const customer = await createCustomer(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 2, [], customer.id); // total 23, AR 23

      await request(server)
        .post(`/api/v1/sales/${sale.id}/payments`)
        .set(auth(tenant.accessToken))
        .send({ method: 'cash', amount: 100, clientReferenceId: unique() })
        .expect(409);
    });

    it('نفس clientReferenceId لدفعة بيع لا يُنشئ دفعة مكرَّرة', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const customer = await createCustomer(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 2, [], customer.id);

      const clientReferenceId = unique();
      await request(server)
        .post(`/api/v1/sales/${sale.id}/payments`)
        .set(auth(tenant.accessToken))
        .send({ method: 'cash', amount: 10, clientReferenceId })
        .expect(201);
      await request(server)
        .post(`/api/v1/sales/${sale.id}/payments`)
        .set(auth(tenant.accessToken))
        .send({ method: 'cash', amount: 10, clientReferenceId })
        .expect(201);

      const paymentsCount = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.payment.count({ where: { companyId: tenant.companyId, saleId: sale.id } }),
      );
      expect(paymentsCount).toBe(1);
    });

    it('دفعة على بيع تابع لمنشأة أخرى غير مرئية (404)', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const product = await createProduct(tenantA);
      const customer = await createCustomer(tenantA);
      await setOpeningStock(tenantA, product.id, 10, 10);
      const sale = await createSale(tenantA, product.id, 2, [], customer.id);

      await request(server)
        .post(`/api/v1/sales/${sale.id}/payments`)
        .set(auth(tenantB.accessToken))
        .send({ method: 'cash', amount: 5, clientReferenceId: unique() })
        .expect(404);
    });

    it('دفعة على بيع ملغى تُرفض بـ409', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const customer = await createCustomer(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 2, [], customer.id);
      await request(server)
        .post(`/api/v1/sales/${sale.id}/cancel`)
        .set(auth(tenant.accessToken))
        .expect(201);

      await request(server)
        .post(`/api/v1/sales/${sale.id}/payments`)
        .set(auth(tenant.accessToken))
        .send({ method: 'cash', amount: 5, clientReferenceId: unique() })
        .expect(409);
    });

    it('عضو بدون صلاحية sales.payment.record يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const customer = await createCustomer(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 2, [], customer.id);
      const accountant = await createScopedUser(tenant, 'Accountant', null);

      await request(server)
        .post(`/api/v1/sales/${sale.id}/payments`)
        .set(auth(accountant.accessToken))
        .send({ method: 'cash', amount: 5, clientReferenceId: unique() })
        .expect(403);
    });

    it('دفعتان متزامنتان حقيقيتان على نفس البيع لا تُنتجان دفعًا زائدًا', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const customer = await createCustomer(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 2, [], customer.id); // AR = 23

      const results = await Promise.all([
        request(server)
          .post(`/api/v1/sales/${sale.id}/payments`)
          .set(auth(tenant.accessToken))
          .send({ method: 'cash', amount: 20, clientReferenceId: unique() }),
        request(server)
          .post(`/api/v1/sales/${sale.id}/payments`)
          .set(auth(tenant.accessToken))
          .send({ method: 'cash', amount: 20, clientReferenceId: unique() }),
      ]);
      const succeeded = results.filter((r) => r.status === 201);
      const failed = results.filter((r) => r.status === 409);
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);

      const paidSum = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.payment.aggregate({
          where: { companyId: tenant.companyId, saleId: sale.id },
          _sum: { amount: true },
        }),
      );
      expect(Number(paidSum._sum.amount)).toBeLessThanOrEqual(23);
    });
  });

  // ---------------------------------------------------------------------------
  // Supplier Payments / AP
  // ---------------------------------------------------------------------------

  describe('دفعات الموردين والذمم الدائنة (Supplier Payments / AP)', () => {
    it('دفعة جزئية لمورد تُنشئ قيدًا Dr ذمم دائنة/Cr نقد، وتُخفّض الرصيد المستحق', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      const purchase = await purchaseAndReceive(tenant, supplier.id, product.id, 10, 10); // AP = 115

      const payment = await request(server)
        .post(`/api/v1/purchases/${purchase.id}/payments`)
        .set(auth(tenant.accessToken))
        .send({ method: 'transfer', amount: 50, reference: 'TRX-1', clientReferenceId: unique() })
        .expect(201);
      expect(payment.body.id).toBe(purchase.id);

      const entries = await getJournalEntry(tenant, 'Purchase', purchase.id);
      const paymentEntry = entries[entries.length - 1];
      const apLine = paymentEntry.lines.find(
        (l) => l.account.code === ACCOUNT_CODES.ACCOUNTS_PAYABLE,
      );
      const bankLine = paymentEntry.lines.find((l) => l.account.code === ACCOUNT_CODES.BANK);
      expect(Number(apLine!.debit)).toBe(50);
      expect(Number(bankLine!.credit)).toBe(50);

      const balances = await request(server)
        .get('/api/v1/accounting/ap/suppliers')
        .set(auth(tenant.accessToken))
        .expect(200);
      const row = balances.body.find((r: any) => r.supplierId === supplier.id);
      expect(row.balance).toBeCloseTo(65, 2);
    });

    it('محاولة دفع أكثر من رصيد الذمم الدائنة المستحق تُرفض بـ409', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      const purchase = await purchaseAndReceive(tenant, supplier.id, product.id, 10, 10);

      await request(server)
        .post(`/api/v1/purchases/${purchase.id}/payments`)
        .set(auth(tenant.accessToken))
        .send({ method: 'cash', amount: 99999, clientReferenceId: unique() })
        .expect(409);
    });

    it('دفعة على أمر شراء لم يُستلَم بعد تُرفض بـ409', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      const created = await request(server)
        .post('/api/v1/purchases')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: 5, unitCost: 10 }],
          clientReferenceId: unique(),
        })
        .expect(201);

      await request(server)
        .post(`/api/v1/purchases/${created.body.id}/payments`)
        .set(auth(tenant.accessToken))
        .send({ method: 'cash', amount: 10, clientReferenceId: unique() })
        .expect(409);
    });

    it('عضو بدون صلاحية purchases.payment.record يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      const purchase = await purchaseAndReceive(tenant, supplier.id, product.id, 10, 10);
      const inventoryManager = await createScopedUser(tenant, 'Inventory Manager', null);

      await request(server)
        .post(`/api/v1/purchases/${purchase.id}/payments`)
        .set(auth(inventoryManager.accessToken))
        .send({ method: 'cash', amount: 10, clientReferenceId: unique() })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Sales Returns
  // ---------------------------------------------------------------------------

  describe('مرتجعات المبيعات (Sales Returns)', () => {
    it('مرتجع جزئي يعكس الإيراد/الضريبة النسبية، ويُعيد المخزون بتكلفة البيع الأصلية، ويعكس COGS', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 4, [{ method: 'cash', amount: 46 }]); // COGS = 40

      const saleItemId = sale.items[0].id;
      const ret = await request(server)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({ items: [{ saleItemId, quantity: 1 }], reason: 'تالف', clientReferenceId: unique() })
        .expect(201);
      expect(Number(ret.body.totalAmount)).toBeCloseTo(11.5, 2); // 1/4 of 46

      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(7); // 10 - 4 + 1

      const entries = await getJournalEntry(tenant, 'Sale', sale.id);
      const returnEntry = entries[entries.length - 1];
      const returnsLine = returnEntry.lines.find(
        (l) => l.account.code === ACCOUNT_CODES.SALES_RETURNS,
      );
      const cogsLine = returnEntry.lines.find(
        (l) => l.account.code === ACCOUNT_CODES.COST_OF_GOODS_SOLD,
      );
      const invLine = returnEntry.lines.find((l) => l.account.code === ACCOUNT_CODES.INVENTORY);
      expect(returnsLine).toBeTruthy();
      expect(Number(cogsLine!.credit)).toBe(10); // 1 unit x original cost 10
      expect(Number(invLine!.debit)).toBe(10);

      const totalDebit = returnEntry.lines.reduce((s, l) => s + Number(l.debit), 0);
      const totalCredit = returnEntry.lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(totalDebit).toBeCloseTo(totalCredit, 2);
    });

    it('محاولة إرجاع كمية أكبر من المتبقي (عبر عدة مرتجعات) تُرفض بـ400', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 4, [{ method: 'cash', amount: 46 }]);
      const saleItemId = sale.items[0].id;

      await request(server)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({ items: [{ saleItemId, quantity: 3 }], clientReferenceId: unique() })
        .expect(201);

      await request(server)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({ items: [{ saleItemId, quantity: 2 }], clientReferenceId: unique() })
        .expect(400); // only 1 left
    });

    it('مرتجعات متعددة جزئية على نفس البيع تتراكم بشكل صحيح حتى الإرجاع الكامل', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 4, [{ method: 'cash', amount: 46 }]);
      const saleItemId = sale.items[0].id;

      await request(server)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({ items: [{ saleItemId, quantity: 2 }], clientReferenceId: unique() })
        .expect(201);
      await request(server)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({ items: [{ saleItemId, quantity: 2 }], clientReferenceId: unique() })
        .expect(201);

      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(10); // fully returned, back to original opening stock
    });

    it('مرتجع بيع آجل (غير مسدد) يُخفّض الذمم المدينة (سياسة الاسترداد: الذمم أولاً)', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const customer = await createCustomer(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 4, [], customer.id); // AR = 46, fully unpaid

      const saleItemId = sale.items[0].id;
      await request(server)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({ items: [{ saleItemId, quantity: 1 }], clientReferenceId: unique() })
        .expect(201);

      const balances = await request(server)
        .get('/api/v1/accounting/ar/customers')
        .set(auth(tenant.accessToken))
        .expect(200);
      const row = balances.body.find((r: any) => r.customerId === customer.id);
      expect(row.balance).toBeCloseTo(34.5, 2); // 46 - 11.5
    });

    it('مرتجع على بيع ملغى يُرفض بـ409', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 4, [{ method: 'cash', amount: 46 }]);
      const saleItemId = sale.items[0].id;
      await request(server)
        .post(`/api/v1/sales/${sale.id}/cancel`)
        .set(auth(tenant.accessToken))
        .expect(201);

      await request(server)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({ items: [{ saleItemId, quantity: 1 }], clientReferenceId: unique() })
        .expect(409);
    });

    it('عضو (كاشير) بدون صلاحية sales.return يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 4, [{ method: 'cash', amount: 46 }]);
      const cashier = await createScopedUser(tenant, 'Cashier', null);

      await request(server)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set(auth(cashier.accessToken))
        .send({
          items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
          clientReferenceId: unique(),
        })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Purchase Returns
  // ---------------------------------------------------------------------------

  describe('مرتجعات المشتريات (Purchase Returns)', () => {
    it('مرتجع جزئي يعكس الذمم الدائنة/المخزون/الضريبة، ولا يُعدّل أمر الشراء الأصلي', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      const purchase = await purchaseAndReceive(tenant, supplier.id, product.id, 10, 10); // subtotal 100, tax 15, total 115

      const purchaseItemId = purchase.items[0].id;
      const ret = await request(server)
        .post(`/api/v1/purchases/${purchase.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({
          items: [{ purchaseItemId, quantity: 2 }],
          reason: 'تالف',
          clientReferenceId: unique(),
        })
        .expect(201);
      expect(Number(ret.body.totalAmount)).toBeCloseTo(23, 2); // 2/10 of 115

      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(8);

      const entries = await getJournalEntry(tenant, 'Purchase', purchase.id);
      const returnEntry = entries[entries.length - 1];
      const apLine = returnEntry.lines.find(
        (l) => l.account.code === ACCOUNT_CODES.ACCOUNTS_PAYABLE,
      );
      const invLine = returnEntry.lines.find((l) => l.account.code === ACCOUNT_CODES.INVENTORY);
      const vatLine = returnEntry.lines.find(
        (l) => l.account.code === ACCOUNT_CODES.VAT_RECEIVABLE,
      );
      expect(Number(apLine!.debit)).toBeCloseTo(23, 2);
      expect(Number(invLine!.credit)).toBeCloseTo(20, 2);
      expect(Number(vatLine!.credit)).toBeCloseTo(3, 2);

      const purchaseUnchanged = await request(server)
        .get(`/api/v1/purchases/${purchase.id}`)
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(Number(purchaseUnchanged.body.totalAmount)).toBeCloseTo(115, 2);
    });

    it('محاولة إرجاع كمية أكبر من المستلم تُرفض بـ400', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      const purchase = await purchaseAndReceive(tenant, supplier.id, product.id, 5, 10);
      const purchaseItemId = purchase.items[0].id;

      await request(server)
        .post(`/api/v1/purchases/${purchase.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({ items: [{ purchaseItemId, quantity: 6 }], clientReferenceId: unique() })
        .expect(400);
    });

    it('مرتجع على أمر شراء لم يُستلَم بعد يُرفض بـ409', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      const created = await request(server)
        .post('/api/v1/purchases')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: 5, unitCost: 10 }],
          clientReferenceId: unique(),
        })
        .expect(201);

      await request(server)
        .post(`/api/v1/purchases/${created.body.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({
          items: [{ purchaseItemId: created.body.items[0].id, quantity: 1 }],
          clientReferenceId: unique(),
        })
        .expect(409);
    });

    it('عضو بدون صلاحية purchases.return يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      const purchase = await purchaseAndReceive(tenant, supplier.id, product.id, 5, 10);
      const accountant = await createScopedUser(tenant, 'Accountant', null);

      await request(server)
        .post(`/api/v1/purchases/${purchase.id}/returns`)
        .set(auth(accountant.accessToken))
        .send({
          items: [{ purchaseItemId: purchase.items[0].id, quantity: 1 }],
          clientReferenceId: unique(),
        })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Inventory Adjustment / Stock Count Accounting
  // ---------------------------------------------------------------------------

  describe('محاسبة تسويات المخزون والجرد', () => {
    it('تسوية زيادة تُنشئ قيد Dr مخزون/Cr أرباح تسوية مخزون', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);

      const adj = await request(server)
        .post('/api/v1/inventory/adjustments')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          productId: product.id,
          quantityDelta: 5,
          unitCost: 10,
          reason: 'جرد إضافي',
        })
        .expect(201);

      const entries = await getJournalEntry(tenant, 'StockAdjustment', adj.body.adjustment.id);
      expect(entries).toHaveLength(1);
      const invLine = entries[0].lines.find((l) => l.account.code === ACCOUNT_CODES.INVENTORY);
      const gainLine = entries[0].lines.find(
        (l) => l.account.code === ACCOUNT_CODES.INVENTORY_ADJUSTMENT_GAIN,
      );
      expect(Number(invLine!.debit)).toBe(50);
      expect(Number(gainLine!.credit)).toBe(50);
    });

    it('تسوية نقصان تُنشئ قيد Dr مصروف تسوية مخزون/Cr مخزون', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);

      const adj = await request(server)
        .post('/api/v1/inventory/adjustments')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          productId: product.id,
          quantityDelta: -3,
          reason: 'تلف',
        })
        .expect(201);

      const entries = await getJournalEntry(tenant, 'StockAdjustment', adj.body.adjustment.id);
      expect(entries).toHaveLength(1);
      const invLine = entries[0].lines.find((l) => l.account.code === ACCOUNT_CODES.INVENTORY);
      const expenseLine = entries[0].lines.find(
        (l) => l.account.code === ACCOUNT_CODES.INVENTORY_ADJUSTMENT_EXPENSE,
      );
      expect(Number(invLine!.credit)).toBe(30); // 3 x 10
      expect(Number(expenseLine!.debit)).toBe(30);
    });

    it('جرد بفروق مختلطة (زيادة لمنتج ونقصان لآخر) يُرحِّل قيدًا واحدًا بخطي ربح ومصروف منفصلين (بدون تقاصّ)', async () => {
      const tenant = await registerTenant();
      const productA = await createProduct(tenant);
      const productB = await createProduct(tenant);
      await setOpeningStock(tenant, productA.id, 10, 10); // will be found MORE
      await setOpeningStock(tenant, productB.id, 10, 20); // will be found LESS

      const count = await request(server)
        .post('/api/v1/inventory/stock-counts')
        .set(auth(tenant.accessToken))
        .send({ warehouseId: tenant.warehouseId, productIds: [productA.id, productB.id] })
        .expect(201);

      await request(server)
        .patch(`/api/v1/inventory/stock-counts/${count.body.id}/lines`)
        .set(auth(tenant.accessToken))
        .send({
          lines: [
            { productId: productA.id, countedQuantity: 12 }, // +2 units @ 10 = 20 gain
            { productId: productB.id, countedQuantity: 9 }, // -1 unit @ 20 = 20 loss
          ],
        })
        .expect(200);

      const completed = await request(server)
        .post(`/api/v1/inventory/stock-counts/${count.body.id}/complete`)
        .set(auth(tenant.accessToken))
        .expect(201);

      const entries = await getJournalEntry(tenant, 'StockCount', completed.body.id);
      expect(entries).toHaveLength(1);
      const gainLine = entries[0].lines.find(
        (l) => l.account.code === ACCOUNT_CODES.INVENTORY_ADJUSTMENT_GAIN,
      );
      const expenseLine = entries[0].lines.find(
        (l) => l.account.code === ACCOUNT_CODES.INVENTORY_ADJUSTMENT_EXPENSE,
      );
      expect(Number(gainLine!.credit)).toBe(20);
      expect(Number(expenseLine!.debit)).toBe(20);

      const totalDebit = entries[0].lines.reduce((s, l) => s + Number(l.debit), 0);
      const totalCredit = entries[0].lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(totalDebit).toBe(totalCredit);
    });

    it('تسوية بدون فرق قيمة فعلي (لا فرق كمية) لا تُنشئ أي قيد محاسبي', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);

      const count = await request(server)
        .post('/api/v1/inventory/stock-counts')
        .set(auth(tenant.accessToken))
        .send({ warehouseId: tenant.warehouseId, productIds: [product.id] })
        .expect(201);
      await request(server)
        .patch(`/api/v1/inventory/stock-counts/${count.body.id}/lines`)
        .set(auth(tenant.accessToken))
        .send({ lines: [{ productId: product.id, countedQuantity: 10 }] }) // matches expected
        .expect(200);
      const completed = await request(server)
        .post(`/api/v1/inventory/stock-counts/${count.body.id}/complete`)
        .set(auth(tenant.accessToken))
        .expect(201);

      const entries = await getJournalEntry(tenant, 'StockCount', completed.body.id);
      expect(entries).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Bank/Cash Reconciliation
  // ---------------------------------------------------------------------------

  describe('التسوية البنكية/النقدية (Bank/Cash Reconciliation)', () => {
    it('إنشاء تسوية يحسب الرصيد الدفتري من القيود المُرحَّلة، ويحسب الفرق بشكل صحيح', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      await createSale(tenant, product.id, 2, [{ method: 'cash', amount: 23 }]); // Dr Cash 23

      const asOfDate = new Date().toISOString().slice(0, 10);
      const rec = await request(server)
        .post('/api/v1/accounting/reconciliations')
        .set(auth(tenant.accessToken))
        .send({
          accountCode: ACCOUNT_CODES.CASH,
          asOfDate,
          statementBalance: 20,
          notes: 'كشف حساب',
        })
        .expect(201);

      expect(Number(rec.body.bookBalance)).toBeCloseTo(23, 2);
      expect(Number(rec.body.difference)).toBeCloseTo(-3, 2);

      const list = await request(server)
        .get('/api/v1/accounting/reconciliations')
        .query({ accountCode: ACCOUNT_CODES.CASH })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(list.body.length).toBeGreaterThanOrEqual(1);
    });

    it('عضو بدون صلاحية accounting.reconciliation.manage يُرفض بـ403 عند الإنشاء، لكن يمكنه القراءة بصلاحية accounting.read', async () => {
      const tenant = await registerTenant();
      const manager = await createScopedUser(tenant, 'Manager', null);

      await request(server)
        .post('/api/v1/accounting/reconciliations')
        .set(auth(manager.accessToken))
        .send({
          accountCode: ACCOUNT_CODES.CASH,
          asOfDate: new Date().toISOString().slice(0, 10),
          statementBalance: 0,
        })
        .expect(403);

      await request(server)
        .get('/api/v1/accounting/reconciliations')
        .set(auth(manager.accessToken))
        .expect(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant isolation / IDOR for new endpoints
  // ---------------------------------------------------------------------------

  describe('عزل المستأجرين وحماية IDOR للمسارات الجديدة', () => {
    it('دفعة مورد على أمر شراء تابع لمنشأة أخرى غير مرئية (404)', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const product = await createProduct(tenantA);
      const supplier = await createSupplier(tenantA);
      const purchase = await purchaseAndReceive(tenantA, supplier.id, product.id, 5, 10);

      await request(server)
        .post(`/api/v1/purchases/${purchase.id}/payments`)
        .set(auth(tenantB.accessToken))
        .send({ method: 'cash', amount: 5, clientReferenceId: unique() })
        .expect(404);
    });

    it('مرتجع مبيعات على بيع تابع لمنشأة أخرى غير مرئية (404)', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const product = await createProduct(tenantA);
      await setOpeningStock(tenantA, product.id, 10, 10);
      const sale = await createSale(tenantA, product.id, 2, [{ method: 'cash', amount: 23 }]);

      await request(server)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set(auth(tenantB.accessToken))
        .send({
          items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
          clientReferenceId: unique(),
        })
        .expect(404);
    });

    it('RLS وحدها (لا فلترة على مستوى التطبيق فقط) تمنع قراءة كل الجداول الستة الجديدة عبر المنشآت', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const product = await createProduct(tenantA);
      const supplier = await createSupplier(tenantA);
      const customer = await createCustomer(tenantA);

      const purchase = await purchaseAndReceive(tenantA, supplier.id, product.id, 5, 10);
      await request(server)
        .post(`/api/v1/purchases/${purchase.id}/payments`)
        .set(auth(tenantA.accessToken))
        .send({ method: 'cash', amount: 1, clientReferenceId: unique() })
        .expect(201);
      await request(server)
        .post(`/api/v1/purchases/${purchase.id}/returns`)
        .set(auth(tenantA.accessToken))
        .send({
          items: [{ purchaseItemId: purchase.items[0].id, quantity: 1 }],
          clientReferenceId: unique(),
        })
        .expect(201);

      const sale = await createSale(tenantA, product.id, 2, [], customer.id);
      await request(server)
        .post(`/api/v1/sales/${sale.id}/payments`)
        .set(auth(tenantA.accessToken))
        .send({ method: 'cash', amount: 1, clientReferenceId: unique() })
        .expect(201);
      await request(server)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set(auth(tenantA.accessToken))
        .send({
          items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
          clientReferenceId: unique(),
        })
        .expect(201);

      await request(server)
        .post('/api/v1/accounting/reconciliations')
        .set(auth(tenantA.accessToken))
        .send({
          accountCode: ACCOUNT_CODES.CASH,
          asOfDate: new Date().toISOString().slice(0, 10),
          statementBalance: 10,
        })
        .expect(201);

      // Direct queries with NO explicit companyId filter, under tenant B's
      // RLS context - if RLS were misconfigured on any of these tables,
      // tenant A's row would leak through. Same pattern as
      // phase4.e2e-spec.ts "RLS مباشرة".
      const supplierPaymentsFromB = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.supplierPayment.findMany({ where: { purchaseId: purchase.id } }),
      );
      const purchaseReturnsFromB = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.purchaseReturn.findMany({ where: { purchaseId: purchase.id } }),
      );
      const salePaymentsFromB = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.payment.findMany({ where: { saleId: sale.id, clientReferenceId: { not: null } } }),
      );
      const saleReturnsFromB = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.saleReturn.findMany({ where: { saleId: sale.id } }),
      );
      const reconciliationsFromB = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.bankReconciliation.findMany({ where: { accountCode: ACCOUNT_CODES.CASH } }),
      );

      expect(supplierPaymentsFromB).toHaveLength(0);
      expect(purchaseReturnsFromB).toHaveLength(0);
      expect(salePaymentsFromB).toHaveLength(0);
      expect(saleReturnsFromB).toHaveLength(0);
      expect(reconciliationsFromB).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Full financial-integrity scenario
  // ---------------------------------------------------------------------------

  describe('سيناريو التكامل المالي الشامل (Financial Integrity)', () => {
    it('شراء -> استلام -> دفعة جزئية لمورد -> بيع آجل -> دفعة جزئية -> دفعة إضافية -> مرتجع مبيعات -> مرتجع مشتريات -> تسوية مخزون -> جرد -> يبقى ميزان المراجعة متوازنًا دائمًا', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant, { costPrice: 10 });
      const supplier = await createSupplier(tenant);
      const customer = await createCustomer(tenant);

      const checkTrialBalance = async () => {
        const tb = await request(server)
          .get('/api/v1/accounting/reports/trial-balance')
          .set(auth(tenant.accessToken))
          .expect(200);
        expect(tb.body.totals.isBalanced).toBe(true);
        expect(tb.body.totals.totalDebit).toBeCloseTo(tb.body.totals.totalCredit, 2);
      };

      // Purchase -> Receive
      const purchase = await purchaseAndReceive(tenant, supplier.id, product.id, 20, 10);
      await checkTrialBalance();

      // Partial supplier payment
      await request(server)
        .post(`/api/v1/purchases/${purchase.id}/payments`)
        .set(auth(tenant.accessToken))
        .send({ method: 'transfer', amount: 50, clientReferenceId: unique() })
        .expect(201);
      await checkTrialBalance();

      // Customer credit sale (fully unpaid)
      const sale = await createSale(tenant, product.id, 5, [], customer.id);
      await checkTrialBalance();

      // Partial customer payment
      await request(server)
        .post(`/api/v1/sales/${sale.id}/payments`)
        .set(auth(tenant.accessToken))
        .send({ method: 'cash', amount: 20, clientReferenceId: unique() })
        .expect(201);
      await checkTrialBalance();

      // Additional customer payment
      await request(server)
        .post(`/api/v1/sales/${sale.id}/payments`)
        .set(auth(tenant.accessToken))
        .send({ method: 'cash', amount: 10, clientReferenceId: unique() })
        .expect(201);
      await checkTrialBalance();

      // Sales return (partial)
      await request(server)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({
          items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
          clientReferenceId: unique(),
        })
        .expect(201);
      await checkTrialBalance();

      // Purchase return (partial)
      await request(server)
        .post(`/api/v1/purchases/${purchase.id}/returns`)
        .set(auth(tenant.accessToken))
        .send({
          items: [{ purchaseItemId: purchase.items[0].id, quantity: 2 }],
          clientReferenceId: unique(),
        })
        .expect(201);
      await checkTrialBalance();

      // Inventory adjustment
      await request(server)
        .post('/api/v1/inventory/adjustments')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          productId: product.id,
          quantityDelta: 2,
          unitCost: 12,
          reason: 'تسوية',
        })
        .expect(201);
      await checkTrialBalance();

      // Stock count with a difference
      const count = await request(server)
        .post('/api/v1/inventory/stock-counts')
        .set(auth(tenant.accessToken))
        .send({ warehouseId: tenant.warehouseId, productIds: [product.id] })
        .expect(201);
      const level = await getStockLevel(tenant, product.id);
      await request(server)
        .patch(`/api/v1/inventory/stock-counts/${count.body.id}/lines`)
        .set(auth(tenant.accessToken))
        .send({
          lines: [{ productId: product.id, countedQuantity: Number(level.quantityOnHand) - 1 }],
        })
        .expect(200);
      await request(server)
        .post(`/api/v1/inventory/stock-counts/${count.body.id}/complete`)
        .set(auth(tenant.accessToken))
        .expect(201);
      await checkTrialBalance();

      // Final cross-report consistency: Balance Sheet must still balance,
      // and the Inventory asset row must equal the live stock valuation.
      const bs = await request(server)
        .get('/api/v1/accounting/reports/balance-sheet')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(bs.body.totals.isBalanced).toBe(true);

      const finalLevel = await getStockLevel(tenant, product.id);
      const inventoryRow = bs.body.assets.find(
        (a: any) => a.accountCode === ACCOUNT_CODES.INVENTORY,
      );
      expect(inventoryRow.balance).toBeCloseTo(Number(finalLevel.inventoryValue), 1);

      const pl = await request(server)
        .get('/api/v1/accounting/reports/profit-and-loss')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(pl.body.netProfit).toBeCloseTo(pl.body.totalRevenue - pl.body.totalExpense, 2);
    });
  });
});
