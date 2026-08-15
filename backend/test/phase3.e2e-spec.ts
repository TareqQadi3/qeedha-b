import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

const unique = () => randomUUID().slice(0, 8);

describe('Phase 3: POS/Sales/Payments/Invoices (e2e)', () => {
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

  /** Registers a fresh company + Owner (all permissions, company-wide branch scope) and returns its token/company/default branch+warehouse. */
  const registerTenant = async () => {
    const id = unique();
    const res = await request(server)
      .post('/api/v1/auth/register-company')
      .send({
        legalName: `متجر POS ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `p3owner-${id}@test.qeedha.local`,
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

  /** Product with a clean, easy-to-verify price (sellingPrice=10, default vatRate=15 -> unit total 11.5). */
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
        sellingPrice: 10,
        ...overrides,
      })
      .expect(201);
    return res.body;
  };

  const setOpeningBalance = async (
    tenant: Awaited<ReturnType<typeof registerTenant>>,
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

  const createPosDevice = async (token: string, branchId: string) => {
    const id = unique();
    const res = await request(server)
      .post('/api/v1/tenancy/pos-devices')
      .set(auth(token))
      .send({ branchId, name: `كاشير ${id}`, deviceCode: `POS-${id}` })
      .expect(201);
    return res.body;
  };

  /** New membership in `tenant`, holding `roleName` scoped to `branchId` (company-wide if null). */
  const createScopedUser = async (
    tenant: Awaited<ReturnType<typeof registerTenant>>,
    roleName: string,
    branchId: string | null,
  ) => {
    const roleId = await getRoleId(tenant.accessToken, roleName);
    const email = `scoped-${unique()}@test.qeedha.local`;
    const password = 'ScopedPass123';
    const created = await request(server)
      .post('/api/v1/iam/users')
      .set(auth(tenant.accessToken))
      .send({
        fullName: 'كاشير',
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

  // sellingPrice=10, vatRate=15% (product default) -> per-unit total = 11.5
  const unitTotal = 11.5;

  // ---------------------------------------------------------------------------
  // Auth / tenant / branch / warehouse / POS device authorization
  // ---------------------------------------------------------------------------

  describe('التفويض (Auth / Tenant / Branch / Warehouse / POS Device)', () => {
    it('بدون توكن يُرفض بـ401', async () => {
      await request(server).post('/api/v1/sales').send({}).expect(401);
    });

    it('لا يمكن الوصول لعملية بيع من منشأة أخرى حتى بمعرفة الـID', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const product = await createProduct(tenantA);
      await setOpeningBalance(tenantA, product.id, 10);

      const sale = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenantA.accessToken))
        .send({
          warehouseId: tenantA.warehouseId,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(201);

      await request(server)
        .get(`/api/v1/sales/${sale.body.id}`)
        .set(auth(tenantB.accessToken))
        .expect(404);
    });

    it('منشأة أخرى تمامًا كمستودع للبيع تُرفض بـ404', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const productB = await createProduct(tenantB);
      await setOpeningBalance(tenantB, productB.id, 10);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenantA.accessToken))
        .send({
          warehouseId: tenantB.warehouseId,
          items: [{ productId: productB.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(404);
    });

    it('عضو مقيّد بفرع لا يمكنه البيع من مستودع فرع آخر بنفس المنشأة (403)', async () => {
      const tenant = await registerTenant();
      const branchA2 = await createBranch(tenant.accessToken);
      const warehouseA2 = await createWarehouse(tenant.accessToken, branchA2.id);
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10, warehouseA2.id);

      const cashier = await createScopedUser(tenant, 'Cashier', tenant.branchId);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(cashier.accessToken))
        .send({
          warehouseId: warehouseA2.id,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(403);
    });

    it('جهاز POS تابع لفرع مختلف عن المستودع يُرفض (409)', async () => {
      const tenant = await registerTenant();
      const branchA2 = await createBranch(tenant.accessToken);
      const posDeviceA2 = await createPosDevice(tenant.accessToken, branchA2.id);
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          posDeviceId: posDeviceA2.id,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(409);
    });

    it('جهاز POS غير نشط يُرفض (409)، وجهاز من منشأة أخرى يُرفض (404)', async () => {
      const tenant = await registerTenant();
      const tenantB = await registerTenant();
      const posDevice = await createPosDevice(tenant.accessToken, tenant.branchId);
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);

      await prisma.withTenant(tenant.companyId, (tx) =>
        tx.posDevice.update({ where: { id: posDevice.id }, data: { status: 'inactive' } }),
      );

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          posDeviceId: posDevice.id,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(409);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenantB.accessToken))
        .send({
          warehouseId: tenantB.warehouseId,
          posDeviceId: posDevice.id,
          items: [{ productId: (await createProduct(tenantB)).id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(404);
    });

    it('عضوية معلَّقة تُرفض حتى مع صلاحية sales.create سارية', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);
      const cashier = await createScopedUser(tenant, 'Cashier', null);

      await prisma.withTenant(tenant.companyId, (tx) =>
        tx.membership.updateMany({
          where: { userId: cashier.userId, companyId: tenant.companyId },
          data: { status: 'suspended' },
        }),
      );

      await request(server)
        .post('/api/v1/sales')
        .set(auth(cashier.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(403);
    });

    it('كاشير بلا صلاحية sales.cancel يُرفض بـ403 عند محاولة الإلغاء', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);
      const cashier = await createScopedUser(tenant, 'Cashier', null);

      const sale = await request(server)
        .post('/api/v1/sales')
        .set(auth(cashier.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(201);

      await request(server)
        .post(`/api/v1/sales/${sale.body.id}/cancel`)
        .set(auth(cashier.accessToken))
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Sales / Payments / Invoices - functional
  // ---------------------------------------------------------------------------

  describe('البيع، الدفع، الفاتورة (Sales/Payments/Invoices)', () => {
    it('بيع سطر واحد نقدًا: يحسب الإجمالي، يخصم المخزون، يولّد فاتورة، ويُسجَّل Audit', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);

      const res = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 2 }],
          payments: [{ method: 'cash', amount: 23 }],
          clientReferenceId: unique(),
        })
        .expect(201);

      expect(res.body.status).toBe('completed');
      expect(res.body.subtotal).toBe('20');
      expect(res.body.taxAmount).toBe('3');
      expect(res.body.totalAmount).toBe('23');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].productSku).toBe(product.sku);
      expect(res.body.payments).toHaveLength(1);
      expect(res.body.payments[0].status).toBe('success');
      expect(res.body.invoice.invoiceNumber).toMatch(/^INV-\d{6}$/);
      expect(res.body.customerId).toBeNull();

      const levels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(levels.body.data[0].quantityOnHand).toBe('8');

      const audit = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findFirst({
          where: {
            companyId: tenant.companyId,
            action: 'sales.sale.complete',
            entityId: res.body.id,
          },
        }),
      );
      expect(audit).not.toBeNull();
    });

    it('بيع بعدة سطور مع خصم على سطر: يحسب الإجماليات الجزئية والكلية بشكل صحيح', async () => {
      const tenant = await registerTenant();
      const productA = await createProduct(tenant, { sellingPrice: 10 });
      const productB = await createProduct(tenant, { sellingPrice: 20, vatRate: 15 });
      await setOpeningBalance(tenant, productA.id, 10);
      await setOpeningBalance(tenant, productB.id, 10);

      // A: 2 * 10 = 20 gross, discount 2 -> line subtotal 18, tax 2.7, total 20.7
      // B: 1 * 20 = 20 gross, no discount -> line subtotal 20, tax 3, total 23
      // Sale: subtotal (sum of gross, pre-discount) = 40, discount 2, tax 5.7, total 43.7
      const res = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [
            { productId: productA.id, quantity: 2, discountAmount: 2 },
            { productId: productB.id, quantity: 1 },
          ],
          payments: [{ method: 'cash', amount: 43.7 }],
          clientReferenceId: unique(),
        })
        .expect(201);

      expect(res.body.subtotal).toBe('40');
      expect(res.body.discountAmount).toBe('2');
      expect(res.body.taxAmount).toBe('5.7');
      expect(res.body.totalAmount).toBe('43.7');
      expect(res.body.items).toHaveLength(2);
    });

    it('الدفع المجزّأ (Split payment): مجموع طريقتين يساوي الإجمالي بالضبط', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);

      const res = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 4 }],
          payments: [
            { method: 'cash', amount: 20 },
            { method: 'card', amount: 26 },
          ],
          clientReferenceId: unique(),
        })
        .expect(201);

      expect(res.body.totalAmount).toBe('46');
      expect(res.body.payments).toHaveLength(2);
      expect(res.body.payments.map((p: any) => p.method).sort()).toEqual(['card', 'cash']);
    });

    it('مجموع الدفعات غير المطابق للإجمالي يُرفض بـ400 (فشل دفع)', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: 5 }],
          clientReferenceId: unique(),
        })
        .expect(400);

      const count = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.sale.count({ where: { companyId: tenant.companyId } }),
      );
      // no sale row should have been created for the rejected request
      expect(count).toBe(0);
    });

    it('خصم أكبر من قيمة السطر يُرفض بـ400', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 1, discountAmount: 100 }],
          payments: [{ method: 'cash', amount: 0 }],
          clientReferenceId: unique(),
        })
        .expect(400);
    });

    it('المخزون غير الكافي يُرفض بـ409 ولا يُنشئ عملية بيع', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 3);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 5 }],
          payments: [{ method: 'cash', amount: 5 * unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(409);

      const levels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(levels.body.data[0].quantityOnHand).toBe('3');
    });

    it('منتج معطّل لا يمكن بيعه', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);
      await request(server)
        .delete(`/api/v1/products/${product.id}`)
        .set(auth(tenant.accessToken))
        .expect(200);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(404);
    });

    it('بيع مرتبط بعميل، وبيع بلا عميل (نقدي سريع) كلاهما يعمل', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);
      const customer = await request(server)
        .post('/api/v1/customers')
        .set(auth(tenant.accessToken))
        .send({ name: 'عميل تجريبي' })
        .expect(201);

      const withCustomer = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          customerId: customer.body.id,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(201);
      expect(withCustomer.body.customerId).toBe(customer.body.id);
      expect(withCustomer.body.invoice.customerId).toBe(customer.body.id);

      const walkIn = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(201);
      expect(walkIn.body.customerId).toBeNull();
    });

    it('إلغاء بيع مكتمل يُرجع المخزون ويُعلّم الفاتورة كملغاة؛ إلغاء مرتين يُرفض', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);

      const sale = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 3 }],
          payments: [{ method: 'cash', amount: 3 * unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(201);

      const cancelled = await request(server)
        .post(`/api/v1/sales/${sale.body.id}/cancel`)
        .set(auth(tenant.accessToken))
        .expect(201);
      expect(cancelled.body.status).toBe('cancelled');
      expect(cancelled.body.invoice.status).toBe('cancelled');

      const levels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(levels.body.data[0].quantityOnHand).toBe('10');

      await request(server)
        .post(`/api/v1/sales/${sale.body.id}/cancel`)
        .set(auth(tenant.accessToken))
        .expect(409);
    });

    it('حالة الدفع pending مدعومة في نموذج البيانات (بدون تدفق HTTP فعلي بعد - لا يوجد مزوّد خارجي)', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);

      const sale = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(201);

      const pendingPayment = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.payment.create({
          data: {
            companyId: tenant.companyId,
            saleId: sale.body.id,
            method: 'external',
            status: 'pending',
            amount: 1,
            currency: 'SAR',
            providerKey: 'test-provider',
            actorMembershipId: sale.body.actorMembershipId,
          },
        }),
      );
      expect(pendingPayment.status).toBe('pending');
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotency / Concurrency
  // ---------------------------------------------------------------------------

  describe('التزامن وحماية التكرار (Idempotency & Concurrency)', () => {
    it('طلب مكرر بنفس clientReferenceId يُعيد نفس عملية البيع دون تكرار', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);
      const clientReferenceId = unique();

      const first = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId,
        })
        .expect(201);

      const second = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId,
        })
        .expect(201);

      expect(second.body.id).toBe(first.body.id);

      const count = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.sale.count({ where: { companyId: tenant.companyId, clientReferenceId } }),
      );
      expect(count).toBe(1);

      const levels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(levels.body.data[0].quantityOnHand).toBe('9');
    });

    it('5 طلبات متزامنة حقيقية بنفس clientReferenceId تُنتج عملية بيع واحدة فقط', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);
      const clientReferenceId = unique();

      const results = await Promise.all(
        Array.from({ length: 5 }).map(() =>
          request(server)
            .post('/api/v1/sales')
            .set(auth(tenant.accessToken))
            .send({
              warehouseId: tenant.warehouseId,
              items: [{ productId: product.id, quantity: 1 }],
              payments: [{ method: 'cash', amount: unitTotal }],
              clientReferenceId,
            }),
        ),
      );

      for (const res of results) {
        expect([200, 201]).toContain(res.status);
      }
      const ids = new Set(results.map((r) => r.body.id));
      expect(ids.size).toBe(1);

      const count = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.sale.count({ where: { companyId: tenant.companyId, clientReferenceId } }),
      );
      expect(count).toBe(1);

      const levels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(levels.body.data[0].quantityOnHand).toBe('9');
    });

    it('عمليتا بيع متزامنتان حقيقيتان على نفس المنتج: واحدة فقط تنجح، والرصيد النهائي لا يصبح سالبًا', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);

      const [resA, resB] = await Promise.all([
        request(server)
          .post('/api/v1/sales')
          .set(auth(tenant.accessToken))
          .send({
            warehouseId: tenant.warehouseId,
            items: [{ productId: product.id, quantity: 7 }],
            payments: [{ method: 'cash', amount: 7 * unitTotal }],
            clientReferenceId: unique(),
          }),
        request(server)
          .post('/api/v1/sales')
          .set(auth(tenant.accessToken))
          .send({
            warehouseId: tenant.warehouseId,
            items: [{ productId: product.id, quantity: 7 }],
            payments: [{ method: 'cash', amount: 7 * unitTotal }],
            clientReferenceId: unique(),
          }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const levels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      const finalStock = Number(levels.body.data[0].quantityOnHand);
      expect(finalStock).toBeGreaterThanOrEqual(0);
      expect(finalStock).toBe(3);

      const completedCount = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.sale.count({ where: { companyId: tenant.companyId, status: 'completed' } }),
      );
      expect(completedCount).toBe(1);
    });

    it('10 فواتير من طلبات متزامنة حقيقية - كل رقم فاتورة فريد بلا تكرار', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 100);

      const results = await Promise.all(
        Array.from({ length: 10 }).map(() =>
          request(server)
            .post('/api/v1/sales')
            .set(auth(tenant.accessToken))
            .send({
              warehouseId: tenant.warehouseId,
              items: [{ productId: product.id, quantity: 1 }],
              payments: [{ method: 'cash', amount: unitTotal }],
              clientReferenceId: unique(),
            })
            .expect(201),
        ),
      );

      const invoiceNumbers = results.map((r) => r.body.invoice.invoiceNumber);
      expect(new Set(invoiceNumbers).size).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Listing / RBAC
  // ---------------------------------------------------------------------------

  describe('القوائم والصلاحيات (Listing & RBAC)', () => {
    it('عضو بلا صلاحية sales.create يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id, 10);

      const roles = await request(server)
        .get('/api/v1/iam/roles')
        .set(auth(tenant.accessToken))
        .expect(200);
      const accountantRole = roles.body.find((r: any) => r.name === 'Accountant');
      const email = `accountant-${unique()}@test.qeedha.local`;
      await request(server)
        .post('/api/v1/iam/users')
        .set(auth(tenant.accessToken))
        .send({ fullName: 'محاسب', email, password: 'AccPass123', roleId: accountantRole.id })
        .expect(201);
      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: email, password: 'AccPass123' })
        .expect(200);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(login.body.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(403);
    });

    it('قائمة المبيعات والفواتير تعرض ما يخص المنشأة فقط، وتدعم الترقيم', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const productA = await createProduct(tenantA);
      const productB = await createProduct(tenantB);
      await setOpeningBalance(tenantA, productA.id, 10);
      await setOpeningBalance(tenantB, productB.id, 10);

      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenantA.accessToken))
        .send({
          warehouseId: tenantA.warehouseId,
          items: [{ productId: productA.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(201);
      await request(server)
        .post('/api/v1/sales')
        .set(auth(tenantB.accessToken))
        .send({
          warehouseId: tenantB.warehouseId,
          items: [{ productId: productB.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(201);

      const salesA = await request(server)
        .get('/api/v1/sales')
        .set(auth(tenantA.accessToken))
        .expect(200);
      expect(salesA.body.data.every((s: any) => s.id !== undefined)).toBe(true);
      expect(salesA.body.data.some((s: any) => s.items?.[0]?.productId === productB.id)).toBe(
        false,
      );

      const invoicesA = await request(server)
        .get('/api/v1/invoices')
        .set(auth(tenantA.accessToken))
        .expect(200);
      expect(invoicesA.body.meta.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // RLS direct
  // ---------------------------------------------------------------------------

  describe('RLS مباشرة على جداول المرحلة الثالثة', () => {
    it('RLS وحدها (بلا فحص تطبيقي) تمنع قراءة sales/invoices عبر المنشآت', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const productA = await createProduct(tenantA);
      await setOpeningBalance(tenantA, productA.id, 10);

      const sale = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenantA.accessToken))
        .send({
          warehouseId: tenantA.warehouseId,
          items: [{ productId: productA.id, quantity: 1 }],
          payments: [{ method: 'cash', amount: unitTotal }],
          clientReferenceId: unique(),
        })
        .expect(201);

      const rows = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.sale.findMany({ where: { id: sale.body.id } }),
      );
      expect(rows).toHaveLength(0);

      const invoiceRows = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.invoice.findMany({ where: { id: sale.body.invoice.id } }),
      );
      expect(invoiceRows).toHaveLength(0);
    });
  });
});
