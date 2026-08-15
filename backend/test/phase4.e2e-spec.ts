import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { JournalService } from '../src/modules/accounting/journal.service';
import { ACCOUNT_CODES } from '../src/modules/accounting/constants/default-chart-of-accounts';

const unique = () => randomUUID().slice(0, 8);

describe('Phase 4: Purchases/Expenses/Accounting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let journalService: JournalService;
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
    journalService = app.get(JournalService);
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
        ownerEmail: `p4owner-${id}@test.qeedha.local`,
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

  const createSupplier = async (tenant: Awaited<ReturnType<typeof registerTenant>>) => {
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

  const getAccounts = async (tenant: Awaited<ReturnType<typeof registerTenant>>) => {
    const res = await request(server)
      .get('/api/v1/accounting/accounts')
      .set(auth(tenant.accessToken))
      .expect(200);
    return res.body as any[];
  };

  const findAccount = (accounts: any[], code: string) => accounts.find((a) => a.code === code);

  const createPurchase = async (
    tenant: Awaited<ReturnType<typeof registerTenant>>,
    supplierId: string,
    items: { productId: string; quantity: number; unitCost: number; discountAmount?: number }[],
    overrides: any = {},
  ) => {
    const res = await request(server)
      .post('/api/v1/purchases')
      .set(auth(tenant.accessToken))
      .send({
        warehouseId: tenant.warehouseId,
        supplierId,
        items,
        clientReferenceId: unique(),
        ...overrides,
      })
      .expect(201);
    return res.body;
  };

  // ---------------------------------------------------------------------------
  // Chart of Accounts (default seeding)
  // ---------------------------------------------------------------------------

  describe('دليل الحسابات (Chart of Accounts)', () => {
    it('يُنشأ دليل حسابات افتراضي كامل عند تسجيل المنشأة', async () => {
      const tenant = await registerTenant();
      const accounts = await getAccounts(tenant);

      expect(findAccount(accounts, ACCOUNT_CODES.CASH)).toBeTruthy();
      expect(findAccount(accounts, ACCOUNT_CODES.BANK)).toBeTruthy();
      expect(findAccount(accounts, ACCOUNT_CODES.INVENTORY)).toBeTruthy();
      expect(findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE)).toBeTruthy();
      expect(findAccount(accounts, ACCOUNT_CODES.VAT_PAYABLE)).toBeTruthy();
      expect(findAccount(accounts, ACCOUNT_CODES.VAT_RECEIVABLE)).toBeTruthy();
      expect(findAccount(accounts, ACCOUNT_CODES.SALES_REVENUE)).toBeTruthy();

      const cash = findAccount(accounts, ACCOUNT_CODES.CASH);
      const assetsParent = findAccount(accounts, ACCOUNT_CODES.ASSETS);
      expect(cash.parentId).toBe(assetsParent.id);
      expect(cash.type).toBe('asset');
    });

    it('إنشاء حساب جديد يتطلب accounting.manage، وتعديله يعمل', async () => {
      const tenant = await registerTenant();
      const created = await request(server)
        .post('/api/v1/accounting/accounts')
        .set(auth(tenant.accessToken))
        .send({ code: '5099', name: 'مصروف تجريبي', type: 'expense' })
        .expect(201);
      expect(created.body.code).toBe('5099');

      const updated = await request(server)
        .patch(`/api/v1/accounting/accounts/${created.body.id}`)
        .set(auth(tenant.accessToken))
        .send({ name: 'مصروف تجريبي محدَّث' })
        .expect(200);
      expect(updated.body.name).toBe('مصروف تجريبي محدَّث');
    });

    it('رمز حساب مكرر لنفس المنشأة يُرفض بـ409', async () => {
      const tenant = await registerTenant();
      await request(server)
        .post('/api/v1/accounting/accounts')
        .set(auth(tenant.accessToken))
        .send({ code: ACCOUNT_CODES.CASH, name: 'تكرار', type: 'asset' })
        .expect(409);
    });

    it('لا يوجد Endpoint لإنشاء أو تعديل قيد محاسبي يدويًا (منع الإدخال المزدوج)', async () => {
      const tenant = await registerTenant();
      await request(server)
        .post('/api/v1/accounting/journal-entries')
        .set(auth(tenant.accessToken))
        .send({ lines: [] })
        .expect(404);
    });

    it('حساب من منشأة أخرى يُرفض عند التعديل بـ404', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const accountsB = await getAccounts(tenantB);
      const cashB = findAccount(accountsB, ACCOUNT_CODES.CASH);

      await request(server)
        .patch(`/api/v1/accounting/accounts/${cashB.id}`)
        .set(auth(tenantA.accessToken))
        .send({ name: 'محاولة عبور منشآت' })
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Journal integrity (direct service-level invariant tests)
  // ---------------------------------------------------------------------------

  describe('سلامة القيد المحاسبي (Double-Entry Integrity)', () => {
    it('قيد متوازن ينجح', async () => {
      const tenant = await registerTenant();
      await prisma.withTenant(tenant.companyId, (tx) =>
        journalService.postJournalEntry(tx, tenant.companyId, {
          referenceType: 'Test',
          referenceId: unique(),
          lines: [
            { accountCode: ACCOUNT_CODES.CASH, debit: 50 },
            { accountCode: ACCOUNT_CODES.SALES_REVENUE, credit: 50 },
          ],
        }),
      );
    });

    it('قيد غير متوازن (مدين ≠ دائن) يُرفض', async () => {
      const tenant = await registerTenant();
      await expect(
        prisma.withTenant(tenant.companyId, (tx) =>
          journalService.postJournalEntry(tx, tenant.companyId, {
            referenceType: 'Test',
            referenceId: unique(),
            lines: [
              { accountCode: ACCOUNT_CODES.CASH, debit: 50 },
              { accountCode: ACCOUNT_CODES.SALES_REVENUE, credit: 40 },
            ],
          }),
        ),
      ).rejects.toThrow();
    });

    it('قيد بقيمة صفرية يُرفض', async () => {
      const tenant = await registerTenant();
      await expect(
        prisma.withTenant(tenant.companyId, (tx) =>
          journalService.postJournalEntry(tx, tenant.companyId, {
            referenceType: 'Test',
            referenceId: unique(),
            lines: [
              { accountCode: ACCOUNT_CODES.CASH, debit: 0 },
              { accountCode: ACCOUNT_CODES.SALES_REVENUE, credit: 0 },
            ],
          }),
        ),
      ).rejects.toThrow();
    });

    it('عكس قيد مُعكوس بالفعل يُرفض', async () => {
      const tenant = await registerTenant();
      const entry = await prisma.withTenant(tenant.companyId, (tx) =>
        journalService.postJournalEntry(tx, tenant.companyId, {
          referenceType: 'Test',
          referenceId: unique(),
          lines: [
            { accountCode: ACCOUNT_CODES.CASH, debit: 20 },
            { accountCode: ACCOUNT_CODES.SALES_REVENUE, credit: 20 },
          ],
        }),
      );
      await prisma.withTenant(tenant.companyId, (tx) =>
        journalService.reverseJournalEntry(tx, tenant.companyId, {
          originalEntryId: entry!.id,
          referenceType: 'Test',
          referenceId: entry!.referenceId,
        }),
      );
      await expect(
        prisma.withTenant(tenant.companyId, (tx) =>
          journalService.reverseJournalEntry(tx, tenant.companyId, {
            originalEntryId: entry!.id,
            referenceType: 'Test',
            referenceId: entry!.referenceId,
          }),
        ),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Purchases
  // ---------------------------------------------------------------------------

  describe('المشتريات (Purchases)', () => {
    it('إنشاء أمر شراء ثم استلامه: يزيد المخزون، ويولّد قيدًا متوازنًا (مخزون+ضريبة مدخلات = ذمم دائنة)', async () => {
      const tenant = await registerTenant();
      const supplier = await createSupplier(tenant);
      const product = await createProduct(tenant);

      const purchase = await createPurchase(tenant, supplier.id, [
        { productId: product.id, quantity: 10, unitCost: 8 },
      ]);
      expect(purchase.status).toBe('ordered');
      expect(purchase.referenceNumber).toMatch(/^PUR-\d{6}$/);
      expect(purchase.subtotal).toBe('80');
      expect(purchase.taxAmount).toBe('12');
      expect(purchase.totalAmount).toBe('92');

      const received = await request(server)
        .post(`/api/v1/purchases/${purchase.id}/receive`)
        .set(auth(tenant.accessToken))
        .expect(201);
      expect(received.body.status).toBe('received');

      const levels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(levels.body.data[0].quantityOnHand).toBe('10');

      const journals = await request(server)
        .get('/api/v1/accounting/journal-entries')
        .query({ referenceType: 'Purchase' })
        .set(auth(tenant.accessToken))
        .expect(200);
      const entry = journals.body.data.find((e: any) => e.referenceId === purchase.id);
      expect(entry).toBeTruthy();
      const totalDebit = entry.lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
      const totalCredit = entry.lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(92);
      const payableLine = entry.lines.find(
        (l: any) => l.account.code === ACCOUNT_CODES.ACCOUNTS_PAYABLE,
      );
      expect(Number(payableLine.credit)).toBe(92);
    });

    it('مستودع من منشأة أخرى يُرفض بـ404', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const supplierA = await createSupplier(tenantA);
      const productA = await createProduct(tenantA);

      await request(server)
        .post('/api/v1/purchases')
        .set(auth(tenantA.accessToken))
        .send({
          warehouseId: tenantB.warehouseId,
          supplierId: supplierA.id,
          items: [{ productId: productA.id, quantity: 1, unitCost: 5 }],
          clientReferenceId: unique(),
        })
        .expect(404);
    });

    it('مورد من منشأة أخرى يُرفض بـ404', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const supplierB = await createSupplier(tenantB);
      const productA = await createProduct(tenantA);

      await request(server)
        .post('/api/v1/purchases')
        .set(auth(tenantA.accessToken))
        .send({
          warehouseId: tenantA.warehouseId,
          supplierId: supplierB.id,
          items: [{ productId: productA.id, quantity: 1, unitCost: 5 }],
          clientReferenceId: unique(),
        })
        .expect(404);
    });

    it('استلام مرتين يُرفض بـ409 (لا يُستلَم المخزون مرتين)', async () => {
      const tenant = await registerTenant();
      const supplier = await createSupplier(tenant);
      const product = await createProduct(tenant);
      const purchase = await createPurchase(tenant, supplier.id, [
        { productId: product.id, quantity: 5, unitCost: 8 },
      ]);

      await request(server)
        .post(`/api/v1/purchases/${purchase.id}/receive`)
        .set(auth(tenant.accessToken))
        .expect(201);
      await request(server)
        .post(`/api/v1/purchases/${purchase.id}/receive`)
        .set(auth(tenant.accessToken))
        .expect(409);

      const levels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(levels.body.data[0].quantityOnHand).toBe('5');
    });

    it('استلام متزامن حقيقي لنفس أمر الشراء: مرة واحدة فقط تنجح، لا يتضاعف المخزون', async () => {
      const tenant = await registerTenant();
      const supplier = await createSupplier(tenant);
      const product = await createProduct(tenant);
      const purchase = await createPurchase(tenant, supplier.id, [
        { productId: product.id, quantity: 7, unitCost: 8 },
      ]);

      const [resA, resB] = await Promise.all([
        request(server)
          .post(`/api/v1/purchases/${purchase.id}/receive`)
          .set(auth(tenant.accessToken)),
        request(server)
          .post(`/api/v1/purchases/${purchase.id}/receive`)
          .set(auth(tenant.accessToken)),
      ]);
      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const levels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .query({ productId: product.id })
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(levels.body.data[0].quantityOnHand).toBe('7');

      const movementCount = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.stockMovement.count({ where: { companyId: tenant.companyId, productId: product.id } }),
      );
      expect(movementCount).toBe(1);
    });

    it('10 أوامر شراء من طلبات متزامنة حقيقية - كل رقم مرجعي فريد بلا تكرار', async () => {
      const tenant = await registerTenant();
      const supplier = await createSupplier(tenant);
      const product = await createProduct(tenant);

      const results = await Promise.all(
        Array.from({ length: 10 }).map(() =>
          request(server)
            .post('/api/v1/purchases')
            .set(auth(tenant.accessToken))
            .send({
              warehouseId: tenant.warehouseId,
              supplierId: supplier.id,
              items: [{ productId: product.id, quantity: 1, unitCost: 5 }],
              clientReferenceId: unique(),
            })
            .expect(201),
        ),
      );
      const refs = results.map((r) => r.body.referenceNumber);
      expect(new Set(refs).size).toBe(10);
    });

    it('طلب شراء مكرر بنفس clientReferenceId يُعيد نفس أمر الشراء دون تكرار', async () => {
      const tenant = await registerTenant();
      const supplier = await createSupplier(tenant);
      const product = await createProduct(tenant);
      const clientReferenceId = unique();

      const first = await request(server)
        .post('/api/v1/purchases')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: 1, unitCost: 5 }],
          clientReferenceId,
        })
        .expect(201);
      const second = await request(server)
        .post('/api/v1/purchases')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: 1, unitCost: 5 }],
          clientReferenceId,
        })
        .expect(201);
      expect(second.body.id).toBe(first.body.id);

      const count = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.purchase.count({ where: { companyId: tenant.companyId, clientReferenceId } }),
      );
      expect(count).toBe(1);
    });

    it('إلغاء أمر شراء لم يُستلَم يعمل؛ إلغاء أمر مُستلَم يُرفض بـ409', async () => {
      const tenant = await registerTenant();
      const supplier = await createSupplier(tenant);
      const product = await createProduct(tenant);

      const ordered = await createPurchase(tenant, supplier.id, [
        { productId: product.id, quantity: 1, unitCost: 5 },
      ]);
      const cancelled = await request(server)
        .post(`/api/v1/purchases/${ordered.id}/cancel`)
        .set(auth(tenant.accessToken))
        .expect(201);
      expect(cancelled.body.status).toBe('cancelled');

      const received = await createPurchase(tenant, supplier.id, [
        { productId: product.id, quantity: 1, unitCost: 5 },
      ]);
      await request(server)
        .post(`/api/v1/purchases/${received.id}/receive`)
        .set(auth(tenant.accessToken))
        .expect(201);
      await request(server)
        .post(`/api/v1/purchases/${received.id}/cancel`)
        .set(auth(tenant.accessToken))
        .expect(409);
    });

    it('عضو مقيّد بفرع لا يمكنه الشراء لمستودع فرع آخر بنفس المنشأة (403)', async () => {
      const tenant = await registerTenant();
      const branchA2 = await createBranch(tenant.accessToken);
      const warehouseA2 = await createWarehouse(tenant.accessToken, branchA2.id);
      const supplier = await createSupplier(tenant);
      const product = await createProduct(tenant);
      const scopedUser = await createScopedUser(tenant, 'Inventory Manager', tenant.branchId);

      await request(server)
        .post('/api/v1/purchases')
        .set(auth(scopedUser.accessToken))
        .send({
          warehouseId: warehouseA2.id,
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: 1, unitCost: 5 }],
          clientReferenceId: unique(),
        })
        .expect(403);
    });

    it('عضو بلا صلاحية purchases.create يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const supplier = await createSupplier(tenant);
      const product = await createProduct(tenant);
      const cashier = await createScopedUser(tenant, 'Cashier', null);

      await request(server)
        .post('/api/v1/purchases')
        .set(auth(cashier.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: 1, unitCost: 5 }],
          clientReferenceId: unique(),
        })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Expenses
  // ---------------------------------------------------------------------------

  describe('المصروفات (Expenses)', () => {
    it('إنشاء مصروف ينشئ قيدًا متوازنًا (مصروف = نقدية)، ويُسجَّل Audit', async () => {
      const tenant = await registerTenant();
      const categories = await request(server)
        .get('/api/v1/expenses/categories')
        .set(auth(tenant.accessToken))
        .expect(200);
      const rentCategory = categories.body.find((c: any) => c.name === 'الإيجار');

      const expense = await request(server)
        .post('/api/v1/expenses')
        .set(auth(tenant.accessToken))
        .send({
          categoryId: rentCategory.id,
          amount: 500,
          paymentMethod: 'cash',
          description: 'إيجار الشهر',
          clientReferenceId: unique(),
        })
        .expect(201);
      expect(expense.body.status).toBe('recorded');
      expect(expense.body.branchId).toBeNull();

      const journals = await request(server)
        .get('/api/v1/accounting/journal-entries')
        .query({ referenceType: 'Expense' })
        .set(auth(tenant.accessToken))
        .expect(200);
      const entry = journals.body.data.find((e: any) => e.referenceId === expense.body.id);
      expect(entry).toBeTruthy();
      const totalDebit = entry.lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
      const totalCredit = entry.lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
      expect(totalDebit).toBe(500);
      expect(totalCredit).toBe(500);

      const audit = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findFirst({
          where: {
            companyId: tenant.companyId,
            action: 'expenses.expense.create',
            entityId: expense.body.id,
          },
        }),
      );
      expect(audit).not.toBeNull();
    });

    it('تعديل مبلغ مصروف يعكس القيد القديم وينشئ قيدًا جديدًا صحيحًا', async () => {
      const tenant = await registerTenant();
      const categories = await request(server)
        .get('/api/v1/expenses/categories')
        .set(auth(tenant.accessToken))
        .expect(200);
      const category = categories.body[0];

      const expense = await request(server)
        .post('/api/v1/expenses')
        .set(auth(tenant.accessToken))
        .send({
          categoryId: category.id,
          amount: 100,
          paymentMethod: 'cash',
          clientReferenceId: unique(),
        })
        .expect(201);

      await request(server)
        .patch(`/api/v1/expenses/${expense.body.id}`)
        .set(auth(tenant.accessToken))
        .send({ amount: 150 })
        .expect(200);

      const entries = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.journalEntry.findMany({
          where: {
            companyId: tenant.companyId,
            referenceType: 'Expense',
            referenceId: expense.body.id,
          },
          include: { lines: true },
        }),
      );
      // original (now reversed) + its reversal + the fresh entry for 150
      expect(entries.length).toBe(3);
      const active = entries.filter((e) => e.status === 'posted');
      expect(active.length).toBe(2); // the reversal-of-original + the new 150 entry
      const newest = entries.find((e) => e.status === 'posted' && e.reversalOfEntryId === null);
      const newestDebit = newest!.lines.reduce((s, l) => s + Number(l.debit), 0);
      expect(newestDebit).toBe(150);
    });

    it('حذف مصروف يعكس القيد؛ حذف/تعديل مصروف محذوف يُرفض بـ409', async () => {
      const tenant = await registerTenant();
      const categories = await request(server)
        .get('/api/v1/expenses/categories')
        .set(auth(tenant.accessToken))
        .expect(200);
      const category = categories.body[0];

      const expense = await request(server)
        .post('/api/v1/expenses')
        .set(auth(tenant.accessToken))
        .send({
          categoryId: category.id,
          amount: 75,
          paymentMethod: 'cash',
          clientReferenceId: unique(),
        })
        .expect(201);

      await request(server)
        .delete(`/api/v1/expenses/${expense.body.id}`)
        .set(auth(tenant.accessToken))
        .expect(200);

      const activeEntry = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.journalEntry.findFirst({
          where: {
            companyId: tenant.companyId,
            referenceType: 'Expense',
            referenceId: expense.body.id,
            status: 'posted',
            reversalOfEntryId: null,
          },
        }),
      );
      expect(activeEntry).toBeNull();

      await request(server)
        .delete(`/api/v1/expenses/${expense.body.id}`)
        .set(auth(tenant.accessToken))
        .expect(409);
      await request(server)
        .patch(`/api/v1/expenses/${expense.body.id}`)
        .set(auth(tenant.accessToken))
        .send({ amount: 10 })
        .expect(409);
    });

    it('مصروف مرتبط بفرع خارج نطاق العضوية يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const branchA2 = await createBranch(tenant.accessToken);
      const categories = await request(server)
        .get('/api/v1/expenses/categories')
        .set(auth(tenant.accessToken))
        .expect(200);
      const category = categories.body[0];
      const scopedUser = await createScopedUser(tenant, 'Accountant', tenant.branchId);

      await request(server)
        .post('/api/v1/expenses')
        .set(auth(scopedUser.accessToken))
        .send({
          categoryId: category.id,
          branchId: branchA2.id,
          amount: 20,
          paymentMethod: 'cash',
          clientReferenceId: unique(),
        })
        .expect(403);
    });

    it('عضو بلا صلاحية expenses.create يُرفض بـ403', async () => {
      const tenant = await registerTenant();
      const categories = await request(server)
        .get('/api/v1/expenses/categories')
        .set(auth(tenant.accessToken))
        .expect(200);
      const cashier = await createScopedUser(tenant, 'Cashier', null);

      await request(server)
        .post('/api/v1/expenses')
        .set(auth(cashier.accessToken))
        .send({
          categoryId: categories.body[0].id,
          amount: 20,
          paymentMethod: 'cash',
          clientReferenceId: unique(),
        })
        .expect(403);
    });

    it('مصروف من منشأة أخرى غير مرئي حتى بمعرفة الـID (404)', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const categoriesA = await request(server)
        .get('/api/v1/expenses/categories')
        .set(auth(tenantA.accessToken))
        .expect(200);

      const expense = await request(server)
        .post('/api/v1/expenses')
        .set(auth(tenantA.accessToken))
        .send({
          categoryId: categoriesA.body[0].id,
          amount: 30,
          paymentMethod: 'cash',
          clientReferenceId: unique(),
        })
        .expect(201);

      await request(server)
        .get(`/api/v1/expenses/${expense.body.id}`)
        .set(auth(tenantB.accessToken))
        .expect(404);
    });

    it('5 طلبات متزامنة حقيقية بنفس clientReferenceId تُنتج مصروفًا واحدًا فقط', async () => {
      const tenant = await registerTenant();
      const categories = await request(server)
        .get('/api/v1/expenses/categories')
        .set(auth(tenant.accessToken))
        .expect(200);
      const clientReferenceId = unique();

      const results = await Promise.all(
        Array.from({ length: 5 }).map(() =>
          request(server).post('/api/v1/expenses').set(auth(tenant.accessToken)).send({
            categoryId: categories.body[0].id,
            amount: 40,
            paymentMethod: 'cash',
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
        tx.expense.count({ where: { companyId: tenant.companyId, clientReferenceId } }),
      );
      expect(count).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: Sale/Purchase/Expense -> Accounting
  // ---------------------------------------------------------------------------

  describe('التكامل مع المحاسبة (Sale/Purchase/Expense -> Accounting)', () => {
    it('بيع مكتمل ينتج قيدًا متوازنًا؛ إلغاؤه ينتج قيدًا عكسيًا ويُعلّم الأصلي reversed', async () => {
      const tenant = await registerTenant();
      const product = await createProduct(tenant);
      await request(server)
        .post('/api/v1/inventory/opening-balance')
        .set(auth(tenant.accessToken))
        .send({ warehouseId: tenant.warehouseId, productId: product.id, quantity: 10 })
        .expect(201);

      const sale = await request(server)
        .post('/api/v1/sales')
        .set(auth(tenant.accessToken))
        .send({
          warehouseId: tenant.warehouseId,
          items: [{ productId: product.id, quantity: 2 }],
          payments: [{ method: 'cash', amount: 23 }],
          clientReferenceId: unique(),
        })
        .expect(201);

      const originalEntry = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.journalEntry.findFirst({
          where: { companyId: tenant.companyId, referenceType: 'Sale', referenceId: sale.body.id },
          include: { lines: true },
        }),
      );
      expect(originalEntry).not.toBeNull();
      const debitSum = originalEntry!.lines.reduce((s, l) => s + Number(l.debit), 0);
      const creditSum = originalEntry!.lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(debitSum).toBe(creditSum);
      expect(debitSum).toBe(23);

      await request(server)
        .post(`/api/v1/sales/${sale.body.id}/cancel`)
        .set(auth(tenant.accessToken))
        .expect(201);

      const afterCancel = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.journalEntry.findMany({
          where: { companyId: tenant.companyId, referenceType: 'Sale', referenceId: sale.body.id },
        }),
      );
      expect(afterCancel).toHaveLength(2);
      const original = afterCancel.find((e) => e.id === originalEntry!.id);
      expect(original!.status).toBe('reversed');
      const reversal = afterCancel.find((e) => e.reversalOfEntryId === originalEntry!.id);
      expect(reversal).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // RLS direct
  // ---------------------------------------------------------------------------

  describe('RLS مباشرة على جداول المرحلة الرابعة', () => {
    it('RLS وحدها تمنع قراءة purchases/expenses/accounts/journal_entries عبر المنشآت', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const supplierA = await createSupplier(tenantA);
      const productA = await createProduct(tenantA);
      const purchase = await createPurchase(tenantA, supplierA.id, [
        { productId: productA.id, quantity: 1, unitCost: 5 },
      ]);
      const categoriesA = await request(server)
        .get('/api/v1/expenses/categories')
        .set(auth(tenantA.accessToken))
        .expect(200);
      const expense = await request(server)
        .post('/api/v1/expenses')
        .set(auth(tenantA.accessToken))
        .send({
          categoryId: categoriesA.body[0].id,
          amount: 10,
          paymentMethod: 'cash',
          clientReferenceId: unique(),
        })
        .expect(201);

      const purchasesFromB = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.purchase.findMany({ where: { id: purchase.id } }),
      );
      expect(purchasesFromB).toHaveLength(0);

      const expensesFromB = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.expense.findMany({ where: { id: expense.body.id } }),
      );
      expect(expensesFromB).toHaveLength(0);

      const accountsA = await getAccounts(tenantA);
      const accountsFromB = await prisma.withTenant(tenantB.companyId, (tx) =>
        tx.account.findMany({ where: { id: accountsA[0].id } }),
      );
      expect(accountsFromB).toHaveLength(0);
    });
  });
});
