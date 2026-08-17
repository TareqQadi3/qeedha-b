import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

const unique = () => randomUUID().slice(0, 8);

describe('Milestone 9: Qeedha Integration (e2e)', () => {
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
        legalName: `متجر تكامل ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `m9owner-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
      })
      .expect(201);

    const branches = await request(server)
      .get('/api/v1/tenancy/branches')
      .set(auth(res.body.accessToken))
      .expect(200);
    const warehouses = await request(server)
      .get('/api/v1/tenancy/warehouses')
      .set(auth(res.body.accessToken))
      .expect(200);
    const defaultBranch = branches.body.find((b: any) => b.isDefault);

    return {
      id,
      accessToken: res.body.accessToken as string,
      companyId: res.body.company.id as string,
      userId: res.body.user.id as string,
      branchId: defaultBranch.id as string,
      branchCode: defaultBranch.code as string,
      warehouseId: warehouses.body[0].id as string,
    };
  };

  type Tenant = Awaited<ReturnType<typeof registerTenant>>;

  const createProduct = async (tenant: Tenant, sellingPrice = 10) => {
    const res = await request(server)
      .post('/api/v1/products')
      .set(auth(tenant.accessToken))
      .send({
        sku: `SKU-${unique()}`,
        name: `منتج ${unique()}`,
        costPrice: 5,
        sellingPrice,
        vatRate: 15,
      })
      .expect(201);
    return res.body;
  };

  const setOpeningStock = (tenant: Tenant, productId: string, quantity: number) =>
    request(server)
      .post('/api/v1/inventory/opening-balance')
      .set(auth(tenant.accessToken))
      .send({ warehouseId: tenant.warehouseId, productId, quantity })
      .expect(201);

  const createSellableProduct = async (tenant: Tenant, units = 5) => {
    const product = await createProduct(tenant);
    await setOpeningStock(tenant, product.id, units);
    return product;
  };

  /** A fully-unpaid (credit) sale - the shape QeedhaTransactionService.submitTransaction is designed to settle. totalAmount for one unit of a 10 SAR / 15% VAT product is always 11.5. */
  const createCreditSale = async (tenant: Tenant, productId: string, customerId: string) => {
    const res = await request(server)
      .post('/api/v1/sales')
      .set(auth(tenant.accessToken))
      .send({
        warehouseId: tenant.warehouseId,
        clientReferenceId: `sale-${unique()}`,
        customerId,
        items: [{ productId, quantity: 1 }],
        payments: [],
      })
      .expect(201);
    return res.body;
  };

  /** Links (or rotates) a company's Qeedha connection and returns the raw bearer token - shown exactly once, exactly like the real merchant flow. */
  const linkConnection = async (tenant: Tenant) => {
    const res = await request(server)
      .post('/api/v1/qeedha-integration/connection')
      .set(auth(tenant.accessToken))
      .expect(201);
    return {
      ...res.body,
      token: `${res.body.publicReference}.${res.body.secret}` as string,
    };
  };

  const resolveCustomer = (
    connectionToken: string,
    body: { externalCustomerReference: string; name?: string; mobile?: string; email?: string },
    expectStatus = 201,
  ) =>
    request(server)
      .post('/api/v1/qeedha-integration/customers/resolve')
      .set(auth(connectionToken))
      .send(body)
      .expect(expectStatus);

  const submitTransaction = (
    connectionToken: string,
    body: Record<string, unknown>,
    expectStatus = 201,
  ) =>
    request(server)
      .post('/api/v1/qeedha-integration/transactions')
      .set(auth(connectionToken))
      .send(body)
      .expect(expectStatus);

  const lookupTransaction = (connectionToken: string, reference: string, expectStatus = 200) =>
    request(server)
      .get(`/api/v1/qeedha-integration/transactions/${reference}`)
      .set(auth(connectionToken))
      .expect(expectStatus);

  const cancelTransaction = (connectionToken: string, reference: string, expectStatus = 201) =>
    request(server)
      .post(`/api/v1/qeedha-integration/transactions/${reference}/cancel`)
      .set(auth(connectionToken))
      .expect(expectStatus);

  /** Sets up: linked connection, resolved external customer, a credit sale for that customer - everything `submitTransaction` needs to succeed. Returns the pieces every scenario below assembles its own request body from. */
  const setupGoldenPath = async (tenant: Tenant, units = 5) => {
    const product = await createSellableProduct(tenant, units);
    const connection = await linkConnection(tenant);
    const externalCustomerReference = `ext-cust-${unique()}`;
    await resolveCustomer(connection.token, {
      externalCustomerReference,
      name: `عميل قيّدها ${unique()}`,
    });
    // The connectionId/customerId are never exposed by the HTTP response
    // (Milestone 9 spec section 5: "should not require knowledge of Qeedha
    // B's internal Customer primary key") - look the mapping up by
    // (companyId, externalCustomerReference) instead, which is unambiguous
    // since a company links at most one Qeedha connection.
    const resolvedMapping = await prisma.withTenant(tenant.companyId, (tx) =>
      tx.integrationCustomerMapping.findFirstOrThrow({
        where: { companyId: tenant.companyId, externalCustomerReference },
      }),
    );
    const sale = await createCreditSale(tenant, product.id, resolvedMapping.customerId);
    return {
      product,
      connection,
      externalCustomerReference,
      customerId: resolvedMapping.customerId,
      sale,
    };
  };

  const submitBody = (
    ctx: Awaited<ReturnType<typeof setupGoldenPath>>,
    tenant: Tenant,
    overrides: Record<string, unknown> = {},
  ) => ({
    externalMerchantId: ctx.connection.publicReference,
    externalCustomerReference: ctx.externalCustomerReference,
    externalTransactionId: `ext-txn-${unique()}`,
    amount: Number(ctx.sale.totalAmount),
    currencyCode: 'SAR',
    invoiceReference: ctx.sale.invoice.invoiceNumber,
    branchReference: tenant.branchCode,
    idempotencyKey: `idem-${unique()}`,
    ...overrides,
  });

  // ---------------------------------------------------------------------
  // 1. Connection creation
  // ---------------------------------------------------------------------
  describe('1. إنشاء ربط التكامل (Connection creation)', () => {
    it('يمنح رابط تكامل جديد مرجعًا عامًا وسرًّا يُعرَض مرة واحدة فقط، ولا يُخزَّن السر بنص صريح', async () => {
      const tenant = await registerTenant();
      const connection = await linkConnection(tenant);

      expect(connection.status).toBe('connected');
      expect(connection.publicReference).toMatch(/^qic_/);
      expect(connection.secret).toBeDefined();
      expect(connection.secretLastFour).toBe(connection.secret.slice(-4));

      const row = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.integrationConnection.findFirstOrThrow({
          where: { companyId: tenant.companyId, providerKey: 'qeedha' },
        }),
      );
      expect(row.secretHash).toBeDefined();
      expect(row.secretHash).not.toBe(connection.secret);
      expect(JSON.stringify(row)).not.toContain(connection.secret);

      const status = await request(server)
        .get('/api/v1/qeedha-integration/connection')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(status.body.status).toBe('connected');
      expect(status.body).not.toHaveProperty('secret');
      expect(status.body).not.toHaveProperty('secretHash');
    });
  });

  // ---------------------------------------------------------------------
  // 2 & 3. Authentication / invalid credentials
  // ---------------------------------------------------------------------
  describe('2-3. المصادقة وبيانات الاعتماد غير الصحيحة (Authentication / invalid credentials)', () => {
    it('رمز وصول صحيح يُصادَق بنجاح على واجهة التكامل الخارجية', async () => {
      const tenant = await registerTenant();
      const connection = await linkConnection(tenant);
      await resolveCustomer(connection.token, {
        externalCustomerReference: `ext-${unique()}`,
        name: 'عميل صحيح',
      });
    });

    it('سر خاطئ لنفس المرجع العام يُرفَض بـ401', async () => {
      const tenant = await registerTenant();
      const connection = await linkConnection(tenant);
      await resolveCustomer(
        `${connection.publicReference}.wrong-secret-value`,
        { externalCustomerReference: `ext-${unique()}`, name: 'x' },
        401,
      );
    });

    it('مرجع عام غير معروف يُرفَض بـ401', async () => {
      await resolveCustomer('qic_doesnotexist.somesecret', { externalCustomerReference: 'x' }, 401);
    });

    it('رمز بصيغة غير صحيحة (بدون فاصل) يُرفَض بـ401', async () => {
      await request(server)
        .post('/api/v1/qeedha-integration/customers/resolve')
        .set(auth('not-a-valid-token'))
        .send({ externalCustomerReference: 'x' })
        .expect(401);
    });

    it('غياب ترويسة Authorization بالكامل يُرفَض بـ401', async () => {
      await request(server)
        .post('/api/v1/qeedha-integration/customers/resolve')
        .send({ externalCustomerReference: 'x' })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------
  // 4. Connection revocation
  // ---------------------------------------------------------------------
  describe('4. إلغاء ربط التكامل (Connection revocation)', () => {
    it('بعد الإلغاء يتوقف الرمز القديم عن العمل فورًا، والحالة تصبح disabled', async () => {
      const tenant = await registerTenant();
      const connection = await linkConnection(tenant);

      await request(server)
        .delete('/api/v1/qeedha-integration/connection')
        .set(auth(tenant.accessToken))
        .expect(200);

      await resolveCustomer(connection.token, { externalCustomerReference: 'x', name: 'x' }, 401);

      const status = await request(server)
        .get('/api/v1/qeedha-integration/connection')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(status.body.status).toBe('disabled');
      expect(status.body.revokedAt).toBeDefined();
    });

    it('إلغاء ربط غير موجود أصلًا يُعيد 404', async () => {
      const tenant = await registerTenant();
      await request(server)
        .delete('/api/v1/qeedha-integration/connection')
        .set(auth(tenant.accessToken))
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------
  // 5. Customer mapping
  // ---------------------------------------------------------------------
  describe('5. ربط العميل الخارجي (Customer mapping)', () => {
    it('أول استدعاء لمرجع عميل خارجي جديد ينشئ عميلًا ويُربطه؛ الاستدعاء الثاني بنفس المرجع لا يُنشئ عميلًا مكررًا', async () => {
      const tenant = await registerTenant();
      const connection = await linkConnection(tenant);
      const externalRef = `ext-${unique()}`;

      const first = await resolveCustomer(connection.token, {
        externalCustomerReference: externalRef,
        name: 'عميل جديد',
      });
      expect(first.body.created).toBe(true);
      expect(first.body.resolved).toBe(true);

      const second = await resolveCustomer(connection.token, {
        externalCustomerReference: externalRef,
        name: 'اسم مختلف يجب تجاهله',
      });
      expect(second.body.created).toBe(false);
      expect(second.body.resolved).toBe(true);
      expect(second.body.customerName).toBe(first.body.customerName);

      const mappings = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.integrationCustomerMapping.findMany({
          where: { companyId: tenant.companyId, externalCustomerReference: externalRef },
        }),
      );
      expect(mappings).toHaveLength(1);
      const customerCount = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.customer.count({ where: { companyId: tenant.companyId } }),
      );
      expect(customerCount).toBe(1);
    });

    it('مرجع عميل خارجي جديد بلا اسم يُعيد 404 (لا يمكن إنشاء عميل بلا اسم)', async () => {
      const tenant = await registerTenant();
      const connection = await linkConnection(tenant);
      await resolveCustomer(
        connection.token,
        { externalCustomerReference: `ext-${unique()}` },
        404,
      );
    });
  });

  // ---------------------------------------------------------------------
  // 6. Merchant mapping
  // ---------------------------------------------------------------------
  describe('6. ربط التاجر الخارجي (Merchant mapping)', () => {
    it('externalMerchantId يجب أن يطابق المرجع العام لرابط التكامل المصادَق عليه، وإلا تُرفض العملية', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      const body = submitBody(ctx, tenant, { externalMerchantId: 'qic_someoneelse' });
      await submitTransaction(ctx.connection.token, body, 400);
    });
  });

  // ---------------------------------------------------------------------
  // 7 & 17. Branch mapping / branch scope
  // ---------------------------------------------------------------------
  describe('7 و17. ربط الفرع ونطاقه (Branch mapping / branch scope)', () => {
    it('مرجع فرع غير معروف لهذه المنشأة يُعيد 404', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      const body = submitBody(ctx, tenant, { branchReference: 'NO-SUCH-BRANCH' });
      await submitTransaction(ctx.connection.token, body, 404);
    });

    it('مرجع فرع صحيح وموجود لكنه لا يطابق فرع الفاتورة الفعلي يُعيد 409', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);

      const otherBranch = await request(server)
        .post('/api/v1/tenancy/branches')
        .set(auth(tenant.accessToken))
        .send({ name: `فرع آخر ${unique()}`, code: `BR-${unique()}` })
        .expect(201);

      const body = submitBody(ctx, tenant, { branchReference: otherBranch.body.code });
      await submitTransaction(ctx.connection.token, body, 409);
    });
  });

  // ---------------------------------------------------------------------
  // 8. Successful transaction
  // ---------------------------------------------------------------------
  describe('8. معاملة ناجحة (Successful transaction)', () => {
    it('معاملة تسوية كاملة لفاتورة آجلة تنجح وتعيد SUCCESS بكل الحقول المتوقعة', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      const body = submitBody(ctx, tenant);

      const res = await submitTransaction(ctx.connection.token, body);
      expect(res.body.status).toBe('SUCCESS');
      expect(res.body.externalTransactionId).toBe(body.externalTransactionId);
      expect(res.body.transactionReference).toBe(body.idempotencyKey);
      expect(res.body.amount).toBe(Number(ctx.sale.totalAmount).toFixed(2));
      expect(res.body.currency).toBe('SAR');
      expect(res.body.invoiceReference).toBe(ctx.sale.invoice.invoiceNumber);
      expect(res.body.processedAt).toBeDefined();
      expect(res.body.failureReason).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // 9 & 10. Duplicate / concurrent duplicate transaction
  // ---------------------------------------------------------------------
  describe('9-10. تكرار المعاملة (Duplicate / concurrent duplicate transaction)', () => {
    it('إعادة إرسال نفس idempotencyKey لا تُنشئ دفعة ثانية وتُعيد نفس نتيجة المعاملة الأصلية', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      const body = submitBody(ctx, tenant);

      const first = await submitTransaction(ctx.connection.token, body);
      const second = await submitTransaction(ctx.connection.token, body);
      expect(second.body).toEqual(first.body);

      const payments = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.payment.findMany({ where: { companyId: tenant.companyId, saleId: ctx.sale.id } }),
      );
      expect(payments).toHaveLength(1);

      const transactions = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.integrationTransaction.findMany({
          where: { companyId: tenant.companyId, idempotencyKey: body.idempotencyKey },
        }),
      );
      expect(transactions).toHaveLength(1);
    });

    it('10 طلبات متزامنة بنفس idempotencyKey: معاملة مالية واحدة فقط تُنشأ، والباقي يُحل إلى نفس النتيجة دون تكرار', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      const body = submitBody(ctx, tenant);

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(server)
            .post('/api/v1/qeedha-integration/transactions')
            .set(auth(ctx.connection.token))
            .send(body),
        ),
      );

      for (const res of results) {
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('SUCCESS');
        expect(res.body.transactionReference).toBe(body.idempotencyKey);
      }

      const payments = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.payment.findMany({ where: { companyId: tenant.companyId, saleId: ctx.sale.id } }),
      );
      expect(payments).toHaveLength(1);

      const transactions = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.integrationTransaction.findMany({
          where: { companyId: tenant.companyId, idempotencyKey: body.idempotencyKey },
        }),
      );
      expect(transactions).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------
  // 11. Transaction lookup
  // ---------------------------------------------------------------------
  describe('11. الاستعلام عن المعاملة (Transaction lookup)', () => {
    it('يمكن الاستعلام عن المعاملة بمفتاح idempotencyKey أو بـ externalTransactionId، ومرجع غير معروف يُعيد 404', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      const body = submitBody(ctx, tenant);
      await submitTransaction(ctx.connection.token, body);

      const byIdempotency = await lookupTransaction(
        ctx.connection.token,
        body.idempotencyKey as string,
      );
      expect(byIdempotency.body.status).toBe('SUCCESS');

      const byExternalId = await lookupTransaction(
        ctx.connection.token,
        body.externalTransactionId as string,
      );
      expect(byExternalId.body.status).toBe('SUCCESS');

      await lookupTransaction(ctx.connection.token, 'does-not-exist', 404);
    });
  });

  // ---------------------------------------------------------------------
  // 12 & 13. Cancellation / cancellation idempotency
  // ---------------------------------------------------------------------
  describe('12-13. إلغاء المعاملة وثبات الإلغاء (Cancellation / cancellation idempotency)', () => {
    it('معاملة فاشلة (تجاوزت الرصيد المستحق) يمكن إلغاؤها بأمان، والإلغاء المكرر يُعيد نفس الحالة (idempotent)', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      // Amount exceeds the sale's outstanding balance -> recordPaymentCore's
      // overpayment guard rejects it -> stored as a FAILED transaction, never a 500.
      const body = submitBody(ctx, tenant, { amount: Number(ctx.sale.totalAmount) + 1000 });

      const submitRes = await submitTransaction(ctx.connection.token, body);
      expect(submitRes.body.status).toBe('FAILED');
      expect(submitRes.body.failureReason).toBeDefined();

      const cancelled = await cancelTransaction(
        ctx.connection.token,
        body.idempotencyKey as string,
      );
      expect(cancelled.body.status).toBe('CANCELLED');

      const cancelledAgain = await cancelTransaction(
        ctx.connection.token,
        body.idempotencyKey as string,
      );
      expect(cancelledAgain.body).toEqual(cancelled.body);
    });

    it('معاملة ناجحة (تسوية مُسدَّدة فعليًا) لا يمكن إلغاؤها عبر هذا التكامل - تُعيد 409 حاسمًا', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      const body = submitBody(ctx, tenant);
      await submitTransaction(ctx.connection.token, body);

      await cancelTransaction(ctx.connection.token, body.idempotencyKey as string, 409);
      // Repeating the attempt is still safely rejected, never silently "succeeds" on a later try.
      await cancelTransaction(ctx.connection.token, body.idempotencyKey as string, 409);
    });

    it('إلغاء مرجع معاملة غير موجود يُعيد 404', async () => {
      const tenant = await registerTenant();
      const connection = await linkConnection(tenant);
      await cancelTransaction(connection.token, 'does-not-exist', 404);
    });
  });

  // ---------------------------------------------------------------------
  // 14 & 15. Tenant isolation / RLS
  // ---------------------------------------------------------------------
  describe('14-15. العزل بين المنشآت وRLS (Tenant isolation / RLS)', () => {
    it('رمز تكامل منشأة A لا يمكنه رؤية أو التأثير على بيانات منشأة B بأي شكل', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const ctxA = await setupGoldenPath(tenantA);
      const connectionB = await linkConnection(tenantB);

      // A resolving a customer never touches B's data at all - both tenants
      // resolving the SAME external reference must map to DIFFERENT customers.
      const sharedRef = `shared-ref-${unique()}`;
      const resA = await resolveCustomer(ctxA.connection.token, {
        externalCustomerReference: sharedRef,
        name: 'عميل أ',
      });
      const resB = await resolveCustomer(connectionB.token, {
        externalCustomerReference: sharedRef,
        name: 'عميل ب',
      });
      expect(resA.body.customerName).not.toBe(resB.body.customerName);

      const mappingA = await prisma.withTenant(tenantA.companyId, (tx) =>
        tx.integrationCustomerMapping.findFirstOrThrow({
          where: { companyId: tenantA.companyId, externalCustomerReference: sharedRef },
        }),
      );
      const mappingB = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.integrationCustomerMapping.findFirstOrThrow({
          where: { companyId: tenantB.companyId, externalCustomerReference: sharedRef },
        }),
      );
      expect(mappingA.customerId).not.toBe(mappingB.customerId);

      // B's token can never look up A's transaction, even by the exact right reference.
      const body = submitBody(ctxA, tenantA);
      const submitted = await submitTransaction(ctxA.connection.token, body);
      expect(submitted.body.status).toBe('SUCCESS');
      await lookupTransaction(connectionB.token, body.idempotencyKey as string, 404);
      await lookupTransaction(connectionB.token, body.externalTransactionId as string, 404);
    });

    it('منشأة لا يمكنها قراءة ربط تكامل منشأة أخرى عبر RLS المباشر', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      await linkConnection(tenantA);
      await linkConnection(tenantB);

      const connectionsFromA = await prisma.withTenant(tenantA.companyId, (tx) =>
        tx.integrationConnection.findMany(),
      );
      expect(connectionsFromA).toHaveLength(1);
      expect(connectionsFromA[0].companyId).toBe(tenantA.companyId);

      const connectionsFromB = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.integrationConnection.findMany(),
      );
      expect(connectionsFromB).toHaveLength(1);
      expect(connectionsFromB[0].companyId).toBe(tenantB.companyId);
    });

    it('منشأة B لا يمكنها إلغاء ربط منشأة A عبر واجهة التاجر (لا يوجد endpoint يقبل companyId)', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      await linkConnection(tenantA);

      await request(server)
        .delete('/api/v1/qeedha-integration/connection')
        .set(auth(tenantB.accessToken))
        .send({ companyId: tenantA.companyId })
        .expect(404); // B has no connection of its own to revoke
    });
  });

  // ---------------------------------------------------------------------
  // 16. RBAC
  // ---------------------------------------------------------------------
  describe('16. الصلاحيات (RBAC)', () => {
    const createCashier = async (tenant: Tenant) => {
      const rolesRes = await request(server)
        .get('/api/v1/iam/roles')
        .set(auth(tenant.accessToken))
        .expect(200);
      const cashierRole = rolesRes.body.find((r: any) => r.name === 'Cashier');
      const email = `cashier-${unique()}@test.qeedha.local`;
      await request(server)
        .post('/api/v1/iam/users')
        .set(auth(tenant.accessToken))
        .send({
          fullName: 'كاشير',
          email,
          password: 'CashierPass123',
          roleId: cashierRole.id,
        })
        .expect(201);
      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: email, password: 'CashierPass123' })
        .expect(200);
      return login.body.accessToken as string;
    };

    it('عضوية بلا صلاحية integration.manage لا يمكنها ربط أو إلغاء ربط التكامل', async () => {
      const tenant = await registerTenant();
      const cashierToken = await createCashier(tenant);

      await request(server)
        .post('/api/v1/qeedha-integration/connection')
        .set(auth(cashierToken))
        .expect(403);

      await linkConnection(tenant);
      await request(server)
        .delete('/api/v1/qeedha-integration/connection')
        .set(auth(cashierToken))
        .expect(403);
    });

    it('عضوية بلا صلاحية integration.read لا يمكنها الاطلاع على حالة الربط', async () => {
      const tenant = await registerTenant();
      await linkConnection(tenant);
      const cashierToken = await createCashier(tenant);

      await request(server)
        .get('/api/v1/qeedha-integration/connection')
        .set(auth(cashierToken))
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------
  // 18 & 19. Invalid amount / invalid currency
  // ---------------------------------------------------------------------
  describe('18-19. مبلغ وعملة غير صحيحين (Invalid amount / invalid currency)', () => {
    it('مبلغ سالب أو صفري يُرفَض بـ400 على مستوى التحقق من المدخلات', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      await submitTransaction(ctx.connection.token, submitBody(ctx, tenant, { amount: 0 }), 400);
      await submitTransaction(ctx.connection.token, submitBody(ctx, tenant, { amount: -5 }), 400);
    });

    it('رمز عملة غير مدعوم يُرفَض بـ400', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      await submitTransaction(
        ctx.connection.token,
        submitBody(ctx, tenant, { currencyCode: 'USD' }),
        400,
      );
    });
  });

  // ---------------------------------------------------------------------
  // 20. Invalid references
  // ---------------------------------------------------------------------
  describe('20. مراجع غير صحيحة (Invalid references)', () => {
    it('مرجع فاتورة غير معروف يُعيد 404', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      await submitTransaction(
        ctx.connection.token,
        submitBody(ctx, tenant, { invoiceReference: 'NO-SUCH-INVOICE' }),
        404,
      );
    });

    it('عميل خارجي غير مُحلَّل بعد (لم يُستدعَ resolve له) يُعيد 404', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      await submitTransaction(
        ctx.connection.token,
        submitBody(ctx, tenant, { externalCustomerReference: 'never-resolved' }),
        404,
      );
    });
  });

  // ---------------------------------------------------------------------
  // 21. Audit events
  // ---------------------------------------------------------------------
  describe('21. أحداث التدقيق (Audit events)', () => {
    it('كل خطوة من دورة حياة التكامل تُسجَّل في سجل التدقيق', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      const body = submitBody(ctx, tenant);
      await submitTransaction(ctx.connection.token, body);

      const logs = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findMany({ where: { companyId: tenant.companyId } }),
      );
      const actions = logs.map((l) => l.action);
      expect(actions).toContain('qeedha_integration.connection.link');
      expect(actions).toContain('qeedha_integration.customer.resolve');
      expect(actions).toContain('qeedha_integration.transaction.create');
      expect(actions).toContain('qeedha_integration.payment.record');
    });

    it('محاولة إلغاء معاملة فاشلة تُسجَّل كحدث تدقيق منفصل', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      const body = submitBody(ctx, tenant, { amount: Number(ctx.sale.totalAmount) + 1000 });
      await submitTransaction(ctx.connection.token, body);
      await cancelTransaction(ctx.connection.token, body.idempotencyKey as string);

      const logs = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findMany({
          where: { companyId: tenant.companyId, action: 'qeedha_integration.transaction.cancel' },
        }),
      );
      expect(logs.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------
  // 22, 24, 25. Financial / COGS / accounting integrity
  // ---------------------------------------------------------------------
  describe('22 و24-25. سلامة القيود المحاسبية والتكلفة (Financial / COGS / accounting integrity)', () => {
    it('بعد تسوية كاملة عبر التكامل: القيد متوازن (مدين = دائن)، الذمم تصفر، وسجل الدفعة يحمل بيانات المزوّد الصحيحة', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);
      const body = submitBody(ctx, tenant);
      const res = await submitTransaction(ctx.connection.token, body);

      const payment = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.payment.findFirstOrThrow({
          where: { companyId: tenant.companyId, saleId: ctx.sale.id },
        }),
      );
      expect(payment.method).toBe('external');
      expect(payment.providerKey).toBe('qeedha');
      expect(payment.externalReference).toBe(body.externalTransactionId);
      expect(payment.idempotencyKey).toBe(body.idempotencyKey);
      expect(Number(payment.amount)).toBe(Number(ctx.sale.totalAmount));

      // Two journal entries share this Sale reference (creation + settlement) -
      // isolate the settlement one by its distinct description rather than
      // relying on postedAt ordering, which can tie at millisecond resolution.
      const settlementEntry = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.journalEntry.findFirstOrThrow({
          where: {
            companyId: tenant.companyId,
            referenceType: 'Sale',
            referenceId: ctx.sale.id,
            description: { contains: 'دفعة' },
          },
          include: { lines: true },
        }),
      );
      const totalDebit = settlementEntry.lines.reduce((sum, l) => sum + Number(l.debit), 0);
      const totalCredit = settlementEntry.lines.reduce((sum, l) => sum + Number(l.credit), 0);
      expect(totalDebit).toBeCloseTo(totalCredit, 2);
      expect(totalDebit).toBeCloseTo(Number(ctx.sale.totalAmount), 2);

      const paidAgg = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.payment.aggregate({
          where: { companyId: tenant.companyId, saleId: ctx.sale.id },
          _sum: { amount: true },
        }),
      );
      const outstanding = Number(ctx.sale.totalAmount) - Number(paidAgg._sum.amount ?? 0);
      expect(outstanding).toBeCloseTo(0, 2);

      expect(res.body.status).toBe('SUCCESS');
    });
  });

  // ---------------------------------------------------------------------
  // 23. Inventory integrity
  // ---------------------------------------------------------------------
  describe('23. سلامة المخزون (Inventory integrity)', () => {
    it('تسوية دفعة عبر التكامل لا تُنشئ أي حركة مخزون إضافية - المعاملة تسدد نقدًا فقط، لا تبيع بضاعة', async () => {
      const tenant = await registerTenant();
      const ctx = await setupGoldenPath(tenant);

      const movementsBefore = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.stockMovement.count({
          where: { companyId: tenant.companyId, referenceId: ctx.sale.id },
        }),
      );
      const stockBefore = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.stockLevel.findFirstOrThrow({
          where: {
            companyId: tenant.companyId,
            productId: ctx.product.id,
            warehouseId: tenant.warehouseId,
          },
        }),
      );

      await submitTransaction(ctx.connection.token, submitBody(ctx, tenant));

      const movementsAfter = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.stockMovement.count({
          where: { companyId: tenant.companyId, referenceId: ctx.sale.id },
        }),
      );
      const stockAfter = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.stockLevel.findFirstOrThrow({
          where: {
            companyId: tenant.companyId,
            productId: ctx.product.id,
            warehouseId: tenant.warehouseId,
          },
        }),
      );

      expect(movementsAfter).toBe(movementsBefore);
      expect(Number(stockAfter.quantityOnHand)).toBe(Number(stockBefore.quantityOnHand));
      expect(Number(stockAfter.averageCost)).toBe(Number(stockBefore.averageCost));
    });
  });
});
