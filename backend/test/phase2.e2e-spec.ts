import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

const unique = () => randomUUID().slice(0, 8);

describe('Phase 2: Products/Inventory/Customers/Suppliers (e2e)', () => {
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

  /** Registers a fresh company + Owner (all Phase 2 permissions) and returns its token/company/default warehouse. */
  const registerTenant = async () => {
    const id = unique();
    const res = await request(server)
      .post('/api/v1/auth/register-company')
      .send({
        legalName: `متجر فحص ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `p2owner-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
      })
      .expect(201);

    const warehouses = await request(server)
      .get('/api/v1/tenancy/warehouses')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);

    return {
      id,
      accessToken: res.body.accessToken as string,
      companyId: res.body.company.id as string,
      userEmail: `p2owner-${id}@test.qeedha.local`,
      warehouseId: warehouses.body[0].id as string,
    };
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createProduct = async (
    tenant: Awaited<ReturnType<typeof registerTenant>>,
    overrides: any = {},
  ) => {
    const res = await request(server)
      .post('/api/v1/products')
      .set(auth(tenant.accessToken))
      .send({
        sku: `SKU-${unique()}`,
        name: `منتج ${unique()}`,
        costPrice: 5,
        sellingPrice: 8,
        ...overrides,
      })
      .expect(201);
    return res.body;
  };

  // ---------------------------------------------------------------------------
  // Products / Categories / Brands / Units
  // ---------------------------------------------------------------------------

  describe('المنتجات (Products)', () => {
    it('دورة كاملة: إنشاء تصنيف/علامة/وحدة، منتج مرتبط بها، بحث، تعديل سعر مع Audit، حذف ناعم', async () => {
      const tenant = await registerTenant();

      const category = await request(server)
        .post('/api/v1/catalog/categories')
        .set(auth(tenant.accessToken))
        .send({ name: 'مواد غذائية' })
        .expect(201);
      const brand = await request(server)
        .post('/api/v1/catalog/brands')
        .set(auth(tenant.accessToken))
        .send({ name: 'علامة تجريبية' })
        .expect(201);
      const unit = await request(server)
        .post('/api/v1/catalog/units')
        .set(auth(tenant.accessToken))
        .send({ name: 'قطعة' })
        .expect(201);

      const product = await createProduct(tenant, {
        categoryId: category.body.id,
        brandId: brand.body.id,
        unitId: unit.body.id,
        barcodes: ['1234567890'],
      });
      expect(product.category.id).toBe(category.body.id);
      expect(product.barcodes).toHaveLength(1);

      const searchByName = await request(server)
        .get('/api/v1/products')
        .query({ search: product.name, page: 1, pageSize: 10 })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(searchByName.body.data.some((p: any) => p.id === product.id)).toBe(true);
      expect(searchByName.body.meta.total).toBeGreaterThanOrEqual(1);

      const searchByBarcode = await request(server)
        .get('/api/v1/products')
        .query({ search: '1234567890' })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(searchByBarcode.body.data.some((p: any) => p.id === product.id)).toBe(true);

      // Price change -> distinct audit event, not just a generic update.
      await request(server)
        .patch(`/api/v1/products/${product.id}`)
        .set(auth(tenant.accessToken))
        .send({ sellingPrice: 9.5 })
        .expect(200);

      const priceAudit = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findFirst({
          where: {
            companyId: tenant.companyId,
            action: 'products.product.price_change',
            entityId: product.id,
          },
        }),
      );
      expect(priceAudit).not.toBeNull();
      expect((priceAudit!.afterState as any).sellingPrice).toBe('9.5');

      // Soft delete -> excluded from default listing.
      await request(server)
        .delete(`/api/v1/products/${product.id}`)
        .set(auth(tenant.accessToken))
        .expect(200);
      const afterDelete = await request(server)
        .get('/api/v1/products')
        .query({ search: product.sku })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(afterDelete.body.data.find((p: any) => p.id === product.id)).toBeUndefined();
    });

    it('SKU فريد لكل منشأة وليس عالميًا - نفس SKU مسموح في منشأتين مختلفتين', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const sku = `SHARED-${unique()}`;

      await createProduct(tenantA, { sku });
      await createProduct(tenantB, { sku }); // must NOT conflict - different tenant

      await request(server)
        .post('/api/v1/products')
        .set(auth(tenantA.accessToken))
        .send({ sku, name: 'تكرار', costPrice: 1, sellingPrice: 2 })
        .expect(409); // but duplicate WITHIN the same tenant is rejected
    });

    it('الباركود فريد لكل منشأة وليس عالميًا', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const barcode = `${unique()}00000`;

      await createProduct(tenantA, { barcodes: [barcode] });
      await createProduct(tenantB, { barcodes: [barcode] }); // allowed - different tenant

      const dup = await createProduct(tenantA, {});
      await request(server)
        .post(`/api/v1/products/${dup.id}/barcodes`)
        .set(auth(tenantA.accessToken))
        .send({ barcode })
        .expect(409); // duplicate WITHIN the same tenant rejected
    });

    it('لا يمكن ربط منتج بتصنيف/علامة/وحدة تابعة لمنشأة أخرى', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();

      const categoryB = await request(server)
        .post('/api/v1/catalog/categories')
        .set(auth(tenantB.accessToken))
        .send({ name: 'تصنيف منشأة أخرى' })
        .expect(201);

      await request(server)
        .post('/api/v1/products')
        .set(auth(tenantA.accessToken))
        .send({
          sku: `X-${unique()}`,
          name: 'محاولة عبور منشآت',
          costPrice: 1,
          sellingPrice: 2,
          categoryId: categoryB.body.id,
        })
        .expect(404);
    });

    it('منشأة A لا تستطيع قراءة/تعديل/حذف منتج منشأة B', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const productB = await createProduct(tenantB);

      await request(server)
        .get(`/api/v1/products/${productB.id}`)
        .set(auth(tenantA.accessToken))
        .expect(404);
      await request(server)
        .patch(`/api/v1/products/${productB.id}`)
        .set(auth(tenantA.accessToken))
        .send({ name: 'تعديل غير مصرح' })
        .expect(404);
      await request(server)
        .delete(`/api/v1/products/${productB.id}`)
        .set(auth(tenantA.accessToken))
        .expect(404);

      // And it must still exist, untouched, for its real tenant.
      const stillThere = await request(server)
        .get(`/api/v1/products/${productB.id}`)
        .set(auth(tenantB.accessToken))
        .expect(200);
      expect(stillThere.body.name).toBe(productB.name);
    });

    it('مستخدم بدون صلاحية products.create يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const roles = await request(server)
        .get('/api/v1/iam/roles')
        .set(auth(tenant.accessToken))
        .expect(200);
      const cashierRole = roles.body.find((r: any) => r.name === 'Cashier');

      const cashierEmail = `cashier-${unique()}@test.qeedha.local`;
      await request(server)
        .post('/api/v1/iam/users')
        .set(auth(tenant.accessToken))
        .send({
          fullName: 'كاشير',
          email: cashierEmail,
          password: 'CashierPass123',
          roleId: cashierRole.id,
        })
        .expect(201);
      const cashierLogin = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: cashierEmail, password: 'CashierPass123' })
        .expect(200);

      // Cashier CAN read products (per default role) ...
      await request(server)
        .get('/api/v1/products')
        .set(auth(cashierLogin.body.accessToken))
        .expect(200);
      // ... but cannot create them.
      await request(server)
        .post('/api/v1/products')
        .set(auth(cashierLogin.body.accessToken))
        .send({ sku: 'X', name: 'ممنوع', costPrice: 1, sellingPrice: 2 })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Inventory
  // ---------------------------------------------------------------------------

  describe('المخزون (Inventory)', () => {
    it('رصيد افتتاحي، تسوية، ورفض تسوية لا يوجد لها رصيد كافٍ', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);

      const opening = await request(server)
        .post('/api/v1/inventory/opening-balance')
        .set(auth(tenant.accessToken))
        .send({ warehouseId: tenant.warehouseId, productId: product.id, quantity: 50 })
        .expect(201);
      expect(opening.body.quantityOnHand).toBe('50');

      // A second opening balance on the same (warehouse, product) is refused.
      await request(server)
        .post('/api/v1/inventory/opening-balance')
        .set(auth(tenant.accessToken))
        .send({ warehouseId: tenant.warehouseId, productId: product.id, quantity: 10 })
        .expect(409);

      const adjusted = await request(server)
        .post('/api/v1/inventory/adjustments')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          productId: product.id,
          quantityDelta: -20,
          reason: 'تلف',
        })
        .expect(201);
      expect(adjusted.body.quantityOnHand).toBe('30');

      // Movement history recorded both events.
      const movements = await request(server)
        .get('/api/v1/inventory/movements')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(movements.body.data.map((m: any) => m.type).sort()).toEqual([
        'adjustment',
        'opening_balance',
      ]);

      // Cannot go negative.
      await request(server)
        .post('/api/v1/inventory/adjustments')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          productId: product.id,
          quantityDelta: -1000,
          reason: 'اختبار',
        })
        .expect(409);
    });

    it('التحويل بين مستودعين يحدّث الرصيدين معًا بشكل ذري', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await request(server)
        .post('/api/v1/inventory/opening-balance')
        .set(auth(tenant.accessToken))
        .send({ warehouseId: tenant.warehouseId, productId: product.id, quantity: 40 })
        .expect(201);

      const branches = await request(server)
        .get('/api/v1/tenancy/branches')
        .set(auth(tenant.accessToken))
        .expect(200);
      const secondWarehouse = await request(server)
        .post('/api/v1/tenancy/warehouses')
        .set(auth(tenant.accessToken))
        .send({ branchId: branches.body[0].id, name: 'مستودع ثانٍ', code: `WH2-${unique()}` })
        .expect(201);

      const transfer = await request(server)
        .post('/api/v1/inventory/transfers')
        .set(auth(tenant.accessToken))
        .send({
          fromWarehouseId: tenant.warehouseId,
          toWarehouseId: secondWarehouse.body.id,
          productId: product.id,
          quantity: 15,
        })
        .expect(201);
      expect(transfer.body.fromQuantityOnHand).toBe('25');
      expect(transfer.body.toQuantityOnHand).toBe('15');
    });

    it('عمليات تسوية متزامنة لا تفقد أي تحديث (Concurrency)', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);

      // 10 concurrent +1 adjustments against a fresh (no opening balance)
      // product - the guarded atomic UPDATE must serialize these correctly
      // with no lost updates.
      await Promise.all(
        Array.from({ length: 10 }).map(() =>
          request(server)
            .post('/api/v1/inventory/adjustments')
            .set(auth(tenant.accessToken))
            .send({
              warehouseId: tenant.warehouseId,
              productId: product.id,
              quantityDelta: 1,
              reason: 'تزامن',
            })
            .expect(201),
        ),
      );

      const levels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(levels.body.data[0].quantityOnHand).toBe('10');

      const movementCount = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.stockMovement.count({ where: { companyId: tenant.companyId, productId: product.id } }),
      );
      expect(movementCount).toBe(10);
    });

    it('الجرد: إنشاء، تسجيل كميات، إتمام يولّد فروقًا كحركات مخزون', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await request(server)
        .post('/api/v1/inventory/opening-balance')
        .set(auth(tenant.accessToken))
        .send({ warehouseId: tenant.warehouseId, productId: product.id, quantity: 100 })
        .expect(201);

      const count = await request(server)
        .post('/api/v1/inventory/stock-counts')
        .set(auth(tenant.accessToken))
        .send({ warehouseId: tenant.warehouseId, productIds: [product.id] })
        .expect(201);
      expect(count.body.lines).toHaveLength(1);
      expect(count.body.lines[0].expectedQuantity).toBe('100');

      await request(server)
        .patch(`/api/v1/inventory/stock-counts/${count.body.id}/lines`)
        .set(auth(tenant.accessToken))
        .send({ lines: [{ productId: product.id, countedQuantity: 97 }] })
        .expect(200);

      await request(server)
        .post(`/api/v1/inventory/stock-counts/${count.body.id}/complete`)
        .set(auth(tenant.accessToken))
        .expect(201);

      const levels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(levels.body.data[0].quantityOnHand).toBe('97');

      // Completed counts are frozen.
      await request(server)
        .patch(`/api/v1/inventory/stock-counts/${count.body.id}/lines`)
        .set(auth(tenant.accessToken))
        .send({ lines: [{ productId: product.id, countedQuantity: 50 }] })
        .expect(409);
    });

    it('منشأة A لا تستطيع قراءة أو تعديل مخزون مستودع منشأة B', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const productB = await createProduct(tenantB);

      // Cannot reference tenant B's warehouse from tenant A at all.
      await request(server)
        .post('/api/v1/inventory/opening-balance')
        .set(auth(tenantA.accessToken))
        .send({ warehouseId: tenantB.warehouseId, productId: productB.id, quantity: 10 })
        .expect(404);

      await request(server)
        .post('/api/v1/inventory/opening-balance')
        .set(auth(tenantB.accessToken))
        .send({ warehouseId: tenantB.warehouseId, productId: productB.id, quantity: 10 })
        .expect(201);

      // Tenant A's stock-levels listing never includes tenant B's rows,
      // even filtered by tenant B's own warehouseId (RLS-backed - the
      // query executes under tenant A's context regardless of the filter).
      const levelsFromA = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ warehouseId: tenantB.warehouseId })
        .set(auth(tenantA.accessToken))
        .expect(200);
      expect(levelsFromA.body.data).toHaveLength(0);
    });

    it('مستخدم بدون صلاحية inventory.adjust يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);

      const roles = await request(server)
        .get('/api/v1/iam/roles')
        .set(auth(tenant.accessToken))
        .expect(200);
      const cashierRole = roles.body.find((r: any) => r.name === 'Cashier');
      const cashierEmail = `cashier-${unique()}@test.qeedha.local`;
      await request(server)
        .post('/api/v1/iam/users')
        .set(auth(tenant.accessToken))
        .send({
          fullName: 'كاشير',
          email: cashierEmail,
          password: 'CashierPass123',
          roleId: cashierRole.id,
        })
        .expect(201);
      const cashierLogin = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: cashierEmail, password: 'CashierPass123' })
        .expect(200);

      await request(server)
        .post('/api/v1/inventory/adjustments')
        .set(auth(cashierLogin.body.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          productId: product.id,
          quantityDelta: 1,
          reason: 'ممنوع',
        })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Customers & Suppliers
  // ---------------------------------------------------------------------------

  describe('العملاء والموردون (Customers & Suppliers)', () => {
    it('عملاء: دورة كاملة + رقم الجوال ليس فريدًا عالميًا', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const phone = '0511111111';

      const customerA = await request(server)
        .post('/api/v1/customers')
        .set(auth(tenantA.accessToken))
        .send({ name: 'أحمد', phone })
        .expect(201);
      // Same phone number in a different tenant must be perfectly fine.
      await request(server)
        .post('/api/v1/customers')
        .set(auth(tenantB.accessToken))
        .send({ name: 'أحمد آخر', phone })
        .expect(201);

      const updated = await request(server)
        .patch(`/api/v1/customers/${customerA.body.id}`)
        .set(auth(tenantA.accessToken))
        .send({ notes: 'عميل مميز' })
        .expect(200);
      expect(updated.body.notes).toBe('عميل مميز');

      await request(server)
        .delete(`/api/v1/customers/${customerA.body.id}`)
        .set(auth(tenantA.accessToken))
        .expect(200);
      const list = await request(server)
        .get('/api/v1/customers')
        .set(auth(tenantA.accessToken))
        .expect(200);
      expect(list.body.data.find((c: any) => c.id === customerA.body.id)).toBeUndefined();
    });

    it('منشأة A لا تستطيع قراءة/تعديل/حذف عميل أو مورد منشأة B', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();

      const customerB = await request(server)
        .post('/api/v1/customers')
        .set(auth(tenantB.accessToken))
        .send({ name: 'عميل ب' })
        .expect(201);
      const supplierB = await request(server)
        .post('/api/v1/suppliers')
        .set(auth(tenantB.accessToken))
        .send({ name: 'مورد ب' })
        .expect(201);

      await request(server)
        .get(`/api/v1/customers/${customerB.body.id}`)
        .set(auth(tenantA.accessToken))
        .expect(404);
      await request(server)
        .patch(`/api/v1/customers/${customerB.body.id}`)
        .set(auth(tenantA.accessToken))
        .send({ name: 'اختراق' })
        .expect(404);
      await request(server)
        .delete(`/api/v1/customers/${customerB.body.id}`)
        .set(auth(tenantA.accessToken))
        .expect(404);

      await request(server)
        .get(`/api/v1/suppliers/${supplierB.body.id}`)
        .set(auth(tenantA.accessToken))
        .expect(404);
      await request(server)
        .patch(`/api/v1/suppliers/${supplierB.body.id}`)
        .set(auth(tenantA.accessToken))
        .send({ name: 'اختراق' })
        .expect(404);
      await request(server)
        .delete(`/api/v1/suppliers/${supplierB.body.id}`)
        .set(auth(tenantA.accessToken))
        .expect(404);
    });

    it('رقم مرجع العميل/المورد فريد لكل منشأة، ومسموح تكراره بين منشأتين', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const reference = `REF-${unique()}`;

      await request(server)
        .post('/api/v1/customers')
        .set(auth(tenantA.accessToken))
        .send({ name: 'عميل 1', reference })
        .expect(201);
      await request(server)
        .post('/api/v1/customers')
        .set(auth(tenantB.accessToken))
        .send({ name: 'عميل 2', reference })
        .expect(201);
      await request(server)
        .post('/api/v1/customers')
        .set(auth(tenantA.accessToken))
        .send({ name: 'عميل مكرر', reference })
        .expect(409);
    });

    it('مستخدم بدون صلاحية suppliers.create يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const roles = await request(server)
        .get('/api/v1/iam/roles')
        .set(auth(tenant.accessToken))
        .expect(200);
      const cashierRole = roles.body.find((r: any) => r.name === 'Cashier');
      const cashierEmail = `cashier-${unique()}@test.qeedha.local`;
      await request(server)
        .post('/api/v1/iam/users')
        .set(auth(tenant.accessToken))
        .send({
          fullName: 'كاشير',
          email: cashierEmail,
          password: 'CashierPass123',
          roleId: cashierRole.id,
        })
        .expect(201);
      const cashierLogin = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: cashierEmail, password: 'CashierPass123' })
        .expect(200);

      await request(server)
        .post('/api/v1/suppliers')
        .set(auth(cashierLogin.body.accessToken))
        .send({ name: 'ممنوع' })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // RLS backstop, verified directly at the DB level for the new Phase 2 tables
  // ---------------------------------------------------------------------------

  describe('RLS مباشرة على جداول المرحلة الثانية', () => {
    it('لا يمكن قراءة منتجات/عملاء/موردين منشأة أخرى حتى عبر استعلام Prisma خام بدون WHERE', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      await createProduct(tenantA);
      await createProduct(tenantB);
      await request(server)
        .post('/api/v1/customers')
        .set(auth(tenantB.accessToken))
        .send({ name: 'عميل ب' })
        .expect(201);

      const productsFromA = await prisma.withTenant(tenantA.companyId, (tx) =>
        tx.product.findMany(),
      );
      expect(productsFromA.every((p) => p.companyId === tenantA.companyId)).toBe(true);

      const customersFromA = await prisma.withTenant(tenantA.companyId, (tx) =>
        tx.customer.findMany(),
      );
      expect(customersFromA.every((c) => c.companyId === tenantA.companyId)).toBe(true);
    });
  });
});
