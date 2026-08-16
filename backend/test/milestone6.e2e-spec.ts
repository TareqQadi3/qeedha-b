import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ACCOUNT_CODES } from '../src/modules/accounting/constants/default-chart-of-accounts';

const unique = () => randomUUID().slice(0, 8);

describe('Milestone 6: Weighted-Average Inventory Valuation & COGS (e2e)', () => {
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
        legalName: `متجر تقييم مخزون ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `m6owner-${id}@test.qeedha.local`,
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

  const createSale = async (
    tenant: Tenant,
    productId: string,
    quantity: number,
    unitPriceTotal: number,
    warehouseId = tenant.warehouseId,
  ) => {
    const res = await request(server)
      .post('/api/v1/sales')
      .set(auth(tenant.accessToken))
      .send({
        warehouseId,
        items: [{ productId, quantity }],
        payments: [{ method: 'cash', amount: unitPriceTotal }],
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

  // ---------------------------------------------------------------------------
  // Weighted average - core formula
  // ---------------------------------------------------------------------------

  describe('التكلفة المرجّحة المتحركة (Weighted Average)', () => {
    it('أول عملية شراء تُنشئ متوسط تكلفة = تكلفة الوحدة نفسها', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);

      await purchaseAndReceive(tenant, supplier.id, product.id, 10, 10);

      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(10);
      expect(Number(level.averageCost)).toBe(10);
      expect(Number(level.inventoryValue)).toBe(100);
    });

    it('المثال الكامل: شراء ثانٍ يُعيد حساب المتوسط المرجّح، وبيع يحسب COGS صحيحًا، وشراء ثالث بعد ذلك يُعيد الحساب مجددًا', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);

      // Opening: 10 units @ 10 SAR = 100
      await setOpeningStock(tenant, product.id, 10, 10);
      let level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(10);
      expect(Number(level.averageCost)).toBe(10);

      // Purchase: 10 units @ 20 SAR = 200. Total 20 units, value 300, avg 15.
      await purchaseAndReceive(tenant, supplier.id, product.id, 10, 20);
      level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(20);
      expect(Number(level.averageCost)).toBe(15);
      expect(Number(level.inventoryValue)).toBe(300);

      // Sale: 5 units. COGS = 5 x 15 = 75. Remaining 15 units, value 225.
      // (Payment = 5 x sellingPrice 10 x 1.15 VAT = 57.5, the exact total
      // SalesService computes server-side - unrelated to the cost/COGS math.)
      const sale1 = await createSale(tenant, product.id, 5, 57.5);
      level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(15);
      expect(Number(level.averageCost)).toBe(15);
      expect(Number(level.inventoryValue)).toBe(225);

      const saleItem1 = sale1.items[0];
      expect(Number(saleItem1.unitCost)).toBe(15);

      const entry1 = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.journalEntry.findFirst({
          where: { companyId: tenant.companyId, referenceType: 'Sale', referenceId: sale1.id },
          include: { lines: { include: { account: true } } },
        }),
      );
      const cogsLine1 = entry1!.lines.find(
        (l) => l.account.code === ACCOUNT_CODES.COST_OF_GOODS_SOLD,
      );
      const invLine1 = entry1!.lines.find((l) => l.account.code === ACCOUNT_CODES.INVENTORY);
      expect(Number(cogsLine1!.debit)).toBe(75);
      expect(Number(invLine1!.credit)).toBe(75);

      // Purchase: 10 units @ 30 SAR = 300. New value = 225 + 300 = 525, qty = 25, avg = 21.
      await purchaseAndReceive(tenant, supplier.id, product.id, 10, 30);
      level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(25);
      expect(Number(level.averageCost)).toBe(21);
      expect(Number(level.inventoryValue)).toBe(525);

      // Sale: 5 units. COGS = 5 x 21 = 105. Remaining 20 units, value 420.
      const sale2 = await createSale(tenant, product.id, 5, 57.5);
      level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(20);
      expect(Number(level.averageCost)).toBe(21);
      expect(Number(level.inventoryValue)).toBe(420);
      expect(Number(sale2.items[0].unitCost)).toBe(21);
    });

    it('بيع كامل الكمية المتوفرة يترك رصيد مخزون صفريًا وقيمة صفرية، والمتوسط يبقى محفوظًا في السجل', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 8);

      await createSale(tenant, product.id, 10, 115);

      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(0);
      expect(Number(level.inventoryValue)).toBe(0);
      // average_cost is left unchanged by an outgoing movement (docs).
      expect(Number(level.averageCost)).toBe(8);
    });

    it('دخول مخزون جديد بعد وصول الرصيد إلى صفر يبدأ قاعدة تكلفة جديدة تمامًا من التكلفة الجديدة', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      await setOpeningStock(tenant, product.id, 5, 8);
      await createSale(tenant, product.id, 5, 57.5); // depletes to 0, avg stays 8 (unused)

      await purchaseAndReceive(tenant, supplier.id, product.id, 4, 50); // fresh cost basis
      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(4);
      expect(Number(level.averageCost)).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // Cost sources per movement type
  // ---------------------------------------------------------------------------

  describe('مصادر التكلفة لكل نوع حركة', () => {
    it('الرصيد الافتتاحي بلا تكلفة صريحة يستخدم Product.costPrice كقاعدة تكلفة أولى (fallback موثَّق)', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant, { costPrice: 7 });
      await setOpeningStock(tenant, product.id, 10); // no unitCost

      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.averageCost)).toBe(7);
    });

    it('تسوية زيادة (IN) بتكلفة صريحة تُحدِّث متوسط التكلفة عبر نفس صيغة المتوسط المرجّح', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10); // value 100

      await request(server)
        .post('/api/v1/inventory/adjustments')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          productId: product.id,
          quantityDelta: 10,
          unitCost: 20,
          reason: 'إضافة كمية بتكلفة موردٍ جديد',
        })
        .expect(201);

      // (10*10 + 10*20) / 20 = 15
      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(20);
      expect(Number(level.averageCost)).toBe(15);
    });

    it('تسوية نقصان (OUT) تستخدم متوسط التكلفة الحالي للتقييم، ولا تُغيّره', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 12);

      await request(server)
        .post('/api/v1/inventory/adjustments')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          productId: product.id,
          quantityDelta: -3,
          reason: 'تلف',
        })
        .expect(201);

      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(7);
      expect(Number(level.averageCost)).toBe(12);
    });

    it('منتج بلا أي رصيد سابق على الإطلاق: تسوية زيادة بلا تكلفة صريحة تستخدم Product.costPrice (بيانات قديمة/legacy)', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant, { costPrice: 9 });

      await request(server)
        .post('/api/v1/inventory/adjustments')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          productId: product.id,
          quantityDelta: 5,
          reason: 'جرد أولي بلا سجل شراء',
        })
        .expect(201);

      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.averageCost)).toBe(9);
    });

    it('تحويل مخزون بين مستودعين ينقل نفس قاعدة التكلفة دون اختراع أو فقدان قيمة', async () => {
      const tenant = await registerTenant();
      const branch2 = await createBranch(tenant.accessToken);
      const warehouse2 = await createWarehouse(tenant.accessToken, branch2.id);
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 13);

      await request(server)
        .post('/api/v1/inventory/transfers')
        .set(auth(tenant.accessToken))
        .send({
          fromWarehouseId: tenant.warehouseId,
          toWarehouseId: warehouse2.id,
          productId: product.id,
          quantity: 4,
        })
        .expect(201);

      const source = await getStockLevel(tenant, product.id, tenant.warehouseId);
      const dest = await getStockLevel(tenant, product.id, warehouse2.id);
      expect(Number(source.quantityOnHand)).toBe(6);
      expect(Number(source.averageCost)).toBe(13);
      expect(Number(dest.quantityOnHand)).toBe(4);
      expect(Number(dest.averageCost)).toBe(13);
    });
  });

  // ---------------------------------------------------------------------------
  // Accounting integration
  // ---------------------------------------------------------------------------

  describe('التكامل المحاسبي (Dr COGS / Cr Inventory)', () => {
    it('لا يمكن للعميل إرسال تكلفة أو COGS مباشرة ضمن طلب البيع - القيمة مُشتقّة من الخادم فقط', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 5);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 1, unitCost: 999, cogs: 999 } as any],
          payments: [{ method: 'cash', amount: 11.5 }],
          clientReferenceId: unique(),
        })
        .expect(400); // forbidNonWhitelisted rejects unknown fields on the item DTO
    });

    it('إلغاء بيع يعكس أيضًا سطري COGS/المخزون، ويُعيد المخزون بنفس تكلفة البيع الأصلية لا بالمتوسط الحالي', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);

      const sale = await createSale(tenant, product.id, 4, 46); // COGS = 4*10 = 40

      // Cost basis drifts upward after the sale but before the cancel.
      await purchaseAndReceive(tenant, supplier.id, product.id, 10, 100);

      await request(server)
        .post(`/api/v1/sales/${sale.id}/cancel`)
        .set(auth(tenant.accessToken))
        .expect(201);

      // Returned 4 units at the ORIGINAL sale cost (10), blended into the
      // post-purchase average, not whatever the average happens to be now:
      // after the sale: 6 units @ avg 10 (unchanged by an outgoing move).
      // after the purchase: (6*10 + 10*100) / 16 = 1060/16 = 66.25.
      // after the return (4 units @ the ORIGINAL cost, 10):
      // (16*66.25 + 4*10) / 20 = (1060 + 40) / 20 = 55.
      const purchaseLevel = await getStockLevel(tenant, product.id);
      expect(Number(purchaseLevel.quantityOnHand)).toBe(20);
      expect(Number(purchaseLevel.averageCost)).toBe(55);

      const entries = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.journalEntry.findMany({
          where: { companyId: tenant.companyId, referenceType: 'Sale', referenceId: sale.id },
          include: { lines: { include: { account: true } } },
        }),
      );
      const reversal = entries.find((e) => e.reversalOfEntryId);
      expect(reversal).toBeTruthy();
      const reversedCogs = reversal!.lines.find(
        (l) => l.account.code === ACCOUNT_CODES.COST_OF_GOODS_SOLD,
      );
      const reversedInv = reversal!.lines.find((l) => l.account.code === ACCOUNT_CODES.INVENTORY);
      expect(Number(reversedCogs!.credit)).toBe(40);
      expect(Number(reversedInv!.debit)).toBe(40);
    });

    it('منتج/رصيد "قديم" (unitCost = null على سطر بيع تاريخي): إلغاؤه لا يتعطل، ويستخدم متوسط التكلفة الحالي كقيمة محايدة للإرجاع', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 6);
      const sale = await createSale(tenant, product.id, 3, 34.5);

      // Simulate a pre-Milestone-6 SaleItem: unitCost was never captured.
      await prisma.withTenant(tenant.companyId, (tx) =>
        tx.saleItem.updateMany({ where: { saleId: sale.id }, data: { unitCost: null } }),
      );

      await request(server)
        .post(`/api/v1/sales/${sale.id}/cancel`)
        .set(auth(tenant.accessToken))
        .expect(201);

      const level = await getStockLevel(tenant, product.id);
      // Neutral fallback: returns at the current average (6), a no-op on it.
      expect(Number(level.quantityOnHand)).toBe(10);
      expect(Number(level.averageCost)).toBe(6);
    });

    it('استلام شراء يُسجَّل في Audit Log، وقيد البيع يُسجَّل مع إجمالي COGS', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 2, 23);

      const auditEntry = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findFirst({
          where: { companyId: tenant.companyId, action: 'sales.sale.complete', entityId: sale.id },
        }),
      );
      expect(auditEntry).not.toBeNull();
      expect((auditEntry!.afterState as any).totalCogs).toBe(20);

      const purchase = await request(server)
        .post('/api/v1/purchases')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: 5, unitCost: 12 }],
          clientReferenceId: unique(),
        })
        .expect(201);
      await request(server)
        .post(`/api/v1/purchases/${purchase.body.id}/receive`)
        .set(auth(tenant.accessToken))
        .expect(201);
      const purchaseAudit = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findFirst({
          where: {
            companyId: tenant.companyId,
            action: 'purchases.purchase.receive',
            entityId: purchase.body.id,
          },
        }),
      );
      expect(purchaseAudit).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  describe('التقارير المالية (P&L / Balance Sheet)', () => {
    it('الأرباح والخسائر تعرض تكلفة البضاعة المباعة وإجمالي الربح (Gross Profit) بشكل صحيح', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 6);
      await createSale(tenant, product.id, 4, 46); // revenueNet = 40, COGS = 4x6 = 24

      const pl = await request(server)
        .get('/api/v1/accounting/reports/profit-and-loss')
        .set(auth(tenant.accessToken))
        .expect(200);

      expect(pl.body.costOfGoodsSold).toBe(24);
      expect(pl.body.grossProfit).toBe(Math.round((pl.body.totalRevenue - 24) * 100) / 100);
      expect(pl.body.netProfit).toBe(
        Math.round((pl.body.totalRevenue - pl.body.totalExpense) * 100) / 100,
      );
    });

    it('الميزانية العمومية: قيمة أصل المخزون تساوي الكمية المتبقية × متوسط التكلفة عند وجود شراء وبيع فقط', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);
      await purchaseAndReceive(tenant, supplier.id, product.id, 20, 10); // Dr Inventory 200
      await createSale(tenant, product.id, 8, 92); // Cr Inventory 80 (COGS = 8x10)

      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.inventoryValue)).toBe(120);

      const bs = await request(server)
        .get('/api/v1/accounting/reports/balance-sheet')
        .set(auth(tenant.accessToken))
        .expect(200);
      const inventoryRow = bs.body.assets.find(
        (a: any) => a.accountCode === ACCOUNT_CODES.INVENTORY,
      );
      expect(inventoryRow.balance).toBe(120);
    });
  });

  // ---------------------------------------------------------------------------
  // Branch scope / Tenant isolation / RBAC
  // ---------------------------------------------------------------------------

  describe('نطاق الفروع وعزل المستأجرين والصلاحيات', () => {
    it('كل مستودع يحمل متوسط تكلفة مستقلًا تمامًا عن مستودعات الفروع الأخرى لنفس المنتج', async () => {
      const tenant = await registerTenant();
      const branch2 = await createBranch(tenant.accessToken);
      const warehouse2 = await createWarehouse(tenant.accessToken, branch2.id);
      const product = await createProduct(tenant);

      await setOpeningStock(tenant, product.id, 10, 10, tenant.warehouseId);
      await setOpeningStock(tenant, product.id, 10, 50, warehouse2.id);

      const levelA = await getStockLevel(tenant, product.id, tenant.warehouseId);
      const levelB = await getStockLevel(tenant, product.id, warehouse2.id);
      expect(Number(levelA.averageCost)).toBe(10);
      expect(Number(levelB.averageCost)).toBe(50);
    });

    it('عضو مقيّد بصلاحية غير كافية لا يستطيع إجراء تسوية بتكلفة (403)', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const cashier = await createScopedUser(tenant, 'Cashier', null);

      await request(server)
        .post('/api/v1/inventory/adjustments')
        .set(auth(cashier.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          productId: product.id,
          quantityDelta: 5,
          unitCost: 20,
          reason: 'محاولة غير مصرح بها',
        })
        .expect(403);
    });

    it('متوسط تكلفة/قيمة مخزون منشأة أخرى غير مرئية إطلاقًا لمنشأة مختلفة (عزل مستأجرين)', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const productA = await createProduct(tenantA);
      const productB = await createProduct(tenantB);
      await setOpeningStock(tenantA, productA.id, 10, 77);
      await setOpeningStock(tenantB, productB.id, 10, 88);

      const levelsA = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .set(auth(tenantA.accessToken))
        .expect(200);
      const skus = levelsA.body.data.map((r: any) => r.productSku);
      expect(skus).not.toContain(productB.sku);

      // Cross-tenant direct read attempt for tenant B's product via A's token
      // yields zero rows (filtered, never leaked) - same convention as every
      // other list endpoint in this codebase.
      const crossRead = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: productB.id })
        .set(auth(tenantA.accessToken))
        .expect(200);
      expect(crossRead.body.data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------

  describe('Idempotency', () => {
    it('إعادة إرسال نفس clientReferenceId لبيع لا يُنشئ حركة مخزون أو COGS مكرَّرة', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);

      const clientReferenceId = unique();
      const body = {
        warehouseId: tenant.warehouseId,
        items: [{ productId: product.id, quantity: 2 }],
        payments: [{ method: 'cash', amount: 23 }],
        clientReferenceId,
      };
      const first = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send(body)
        .expect(201);
      const second = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send(body)
        .expect(201);
      expect(second.body.id).toBe(first.body.id);

      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(8); // only ONE deduction of 2, not 4

      const movements = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.stockMovement.findMany({
          where: { companyId: tenant.companyId, referenceType: 'Sale', referenceId: first.body.id },
        }),
      );
      expect(movements).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrency
  // ---------------------------------------------------------------------------

  describe('التزامن (Concurrency)', () => {
    it('عمليتا شراء متزامنتان حقيقيتان لنفس المنتج/المستودع تُنتجان كمية ومتوسط تكلفة صحيحَين نهائيًا', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      const supplier = await createSupplier(tenant);

      const makePurchase = (unitCost: number) =>
        request(server)
          .post('/api/v1/purchases')
          .set(auth(tenant.accessToken))
          .send({
            warehouseId: tenant.warehouseId,
            supplierId: supplier.id,
            items: [{ productId: product.id, quantity: 10, unitCost }],
            clientReferenceId: unique(),
          })
          .expect(201);

      const [p1, p2] = await Promise.all([makePurchase(10), makePurchase(20)]);
      await Promise.all([
        request(server)
          .post(`/api/v1/purchases/${p1.body.id}/receive`)
          .set(auth(tenant.accessToken))
          .expect(201),
        request(server)
          .post(`/api/v1/purchases/${p2.body.id}/receive`)
          .set(auth(tenant.accessToken))
          .expect(201),
      ]);

      const level = await getStockLevel(tenant, product.id);
      // Regardless of DB execution order, the guarded UPDATE serializes both
      // writes - final state must be exactly 20 units, value 300, avg 15.
      expect(Number(level.quantityOnHand)).toBe(20);
      expect(Number(level.inventoryValue)).toBe(300);
      expect(Number(level.averageCost)).toBe(15);

      const movements = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.stockMovement.findMany({
          where: { companyId: tenant.companyId, productId: product.id, type: 'purchase' },
        }),
      );
      expect(movements).toHaveLength(2);
    });

    it('10 عمليات بيع متزامنة حقيقية لنفس المنتج لا تُنتج رصيدًا سالبًا ولا COGS خاطئًا، ومجموع COGS المُرحَّل = الكمية المباعة فعليًا × التكلفة', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 5, 10); // only 5 units available

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(server)
            .post('/api/v1/sales')
            .set(auth(tenant.accessToken))
            .send({
              warehouseId: tenant.warehouseId,
              items: [{ productId: product.id, quantity: 1 }],
              payments: [{ method: 'cash', amount: 11.5 }],
              clientReferenceId: unique(),
            }),
        ),
      );

      const succeeded = results.filter((r) => r.status === 201);
      const failed = results.filter((r) => r.status === 409);
      expect(succeeded).toHaveLength(5);
      expect(failed).toHaveLength(5);

      const level = await getStockLevel(tenant, product.id);
      expect(Number(level.quantityOnHand)).toBe(0);
      expect(Number(level.averageCost)).toBe(10);

      const entries = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.journalEntry.findMany({
          where: { companyId: tenant.companyId, referenceType: 'Sale', status: 'posted' },
          include: { lines: { include: { account: true } } },
        }),
      );
      const totalCogsPosted = entries
        .flatMap((e) => e.lines)
        .filter((l) => l.account.code === ACCOUNT_CODES.COST_OF_GOODS_SOLD)
        .reduce((s, l) => s + Number(l.debit), 0);
      expect(totalCogsPosted).toBe(50); // 5 units x 10
    });
  });

  // ---------------------------------------------------------------------------
  // Accounting invariants
  // ---------------------------------------------------------------------------

  describe('ثوابت محاسبية (Accounting Invariants)', () => {
    it('لكل بيع مُرحَّل: مدين = دائن، ونقصان حساب المخزون = COGS المُرحَّل بالضبط', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningStock(tenant, product.id, 10, 10);
      const sale = await createSale(tenant, product.id, 3, 34.5);

      const entry = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.journalEntry.findFirst({
          where: { companyId: tenant.companyId, referenceType: 'Sale', referenceId: sale.id },
          include: { lines: { include: { account: true } } },
        }),
      );
      const totalDebit = entry!.lines.reduce((s, l) => s + Number(l.debit), 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(totalDebit).toBe(totalCredit);

      const invLine = entry!.lines.find((l) => l.account.code === ACCOUNT_CODES.INVENTORY);
      const cogsLine = entry!.lines.find(
        (l) => l.account.code === ACCOUNT_CODES.COST_OF_GOODS_SOLD,
      );
      expect(Number(invLine!.credit)).toBe(30); // 3 x 10
      expect(Number(cogsLine!.debit)).toBe(30);
      expect(Number(invLine!.credit)).toBe(Number(cogsLine!.debit));
    });
  });
});
