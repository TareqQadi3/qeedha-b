import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const unique = () => randomUUID().slice(0, 8);

async function buildXlsxBuffer(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

describe('Milestone 3: Excel Import (e2e)', () => {
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
        legalName: `متجر استيراد ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `importer-${id}@test.qeedha.local`,
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
    await request(server)
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
    return { accessToken: login.body.accessToken as string };
  };

  const uploadJob = (
    tenant: Awaited<ReturnType<typeof registerTenant>>,
    entityType: string,
    buffer: Buffer,
    opts: { targetWarehouseId?: string; clientReferenceId?: string; token?: string } = {},
  ) => {
    let req = request(server)
      .post('/api/v1/imports/jobs')
      .set(auth(opts.token ?? tenant.accessToken))
      .field('entityType', entityType);
    if (opts.targetWarehouseId) req = req.field('targetWarehouseId', opts.targetWarehouseId);
    if (opts.clientReferenceId) req = req.field('clientReferenceId', opts.clientReferenceId);
    return req.attach('file', buffer, 'import.xlsx');
  };

  const setMapping = (
    tenant: { accessToken: string },
    jobId: string,
    mapping: Record<string, number>,
  ) =>
    request(server)
      .patch(`/api/v1/imports/jobs/${jobId}/mapping`)
      .set(auth(tenant.accessToken))
      .send({ mapping });

  const validateJob = (tenant: { accessToken: string }, jobId: string) =>
    request(server).post(`/api/v1/imports/jobs/${jobId}/validate`).set(auth(tenant.accessToken));

  const confirmJob = (tenant: { accessToken: string }, jobId: string) =>
    request(server).post(`/api/v1/imports/jobs/${jobId}/confirm`).set(auth(tenant.accessToken));

  // ---------------------------------------------------------------------
  // Products: full golden path
  // ---------------------------------------------------------------------

  describe('استيراد منتجات (المسار الكامل)', () => {
    it('يمر بكل مراحل Upload -> Detect -> Map -> Preview -> Validate -> Confirm بنجاح', async () => {
      const tenant = await registerTenant();
      const sku1 = `IMP-${unique()}`;
      const sku2 = `IMP-${unique()}`;
      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price'],
        [
          [sku1, 'منتج مستورد أول', 10, 15],
          [sku2, 'منتج مستورد ثاني', 5, 8],
        ],
      );

      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      expect(created.body.status).toBe('ready');
      expect(created.body.detectedColumns).toEqual(['SKU', 'Name', 'Cost Price', 'Selling Price']);
      // Auto-detected mapping should already have all four required fields resolved.
      expect(created.body.columnMapping).toEqual({
        sku: 0,
        name: 1,
        costPrice: 2,
        sellingPrice: 3,
      });
      const jobId = created.body.id;

      const preview = await request(server)
        .get(`/api/v1/imports/jobs/${jobId}/preview`)
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(preview.body.totalRows).toBe(2);
      expect(preview.body.validRowCount).toBe(2);
      expect(preview.body.errorRowCount).toBe(0);

      // Preview must never write to the target table.
      const beforeConfirm = await request(server)
        .get('/api/v1/products')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(beforeConfirm.body.data.some((p: any) => p.sku === sku1)).toBe(false);

      const validated = await validateJob(tenant, jobId).expect(201);
      expect(validated.body.status).toBe('validated');
      expect(validated.body.validRows).toBe(2);
      expect(validated.body.errorRows).toBe(0);

      const confirmed = await confirmJob(tenant, jobId).expect(201);
      expect(confirmed.body.status).toBe('completed');
      expect(confirmed.body.importedRows).toBe(2);

      const afterConfirm = await request(server)
        .get('/api/v1/products')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(afterConfirm.body.data.some((p: any) => p.sku === sku1)).toBe(true);
      expect(afterConfirm.body.data.some((p: any) => p.sku === sku2)).toBe(true);
    });

    it('يرفض الاستيراد قبل إتمام Validate', async () => {
      const tenant = await registerTenant();
      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price'],
        [[`IMP-${unique()}`, 'منتج', 5, 8]],
      );
      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      await confirmJob(tenant, created.body.id).expect(409);
    });

    it('صف بحقل مطلوب مفقود يُرفض برسالة واضحة، ولا يمنع استيراد بقية الصفوف الصحيحة', async () => {
      const tenant = await registerTenant();
      const goodSku = `IMP-${unique()}`;
      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price'],
        [
          ['', 'منتج بلا SKU', 5, 8],
          [goodSku, 'منتج صحيح', 5, 8],
        ],
      );
      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      const validated = await validateJob(tenant, created.body.id).expect(201);
      expect(validated.body.validRows).toBe(1);
      expect(validated.body.errorRows).toBe(1);
      const badRow = validated.body.validationErrors.find((r: any) => r.rowNumber === 2);
      expect(badRow.errors).toContain('SKU مطلوب');

      const confirmed = await confirmJob(tenant, created.body.id).expect(201);
      expect(confirmed.body.importedRows).toBe(1);
      expect(confirmed.body.errorRows).toBe(1);

      const products = await request(server)
        .get('/api/v1/products')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(products.body.data.some((p: any) => p.sku === goodSku)).toBe(true);
    });

    it('SKU مكرر مع منتج موجود بالفعل يُرفض في التحقق', async () => {
      const tenant = await registerTenant();
      const existingSku = `IMP-${unique()}`;
      await request(server)
        .post('/api/v1/products')
        .set(auth(tenant.accessToken))
        .send({ sku: existingSku, name: 'منتج موجود مسبقًا', costPrice: 1, sellingPrice: 2 })
        .expect(201);

      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price'],
        [[existingSku, 'محاولة تكرار', 5, 8]],
      );
      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      const validated = await validateJob(tenant, created.body.id).expect(201);
      expect(validated.body.errorRows).toBe(1);
      expect(validated.body.validationErrors[0].errors).toContain(
        'SKU مستخدم بالفعل في هذه المنشأة',
      );
    });

    it('SKU مكرر داخل نفس الملف يُرفض للصف الثاني فقط', async () => {
      const tenant = await registerTenant();
      const dupSku = `IMP-${unique()}`;
      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price'],
        [
          [dupSku, 'الأول', 5, 8],
          [dupSku, 'الثاني (مكرر)', 5, 8],
        ],
      );
      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      const validated = await validateJob(tenant, created.body.id).expect(201);
      expect(validated.body.validRows).toBe(1);
      expect(validated.body.errorRows).toBe(1);
      const dupError = validated.body.validationErrors.find((r: any) => r.rowNumber === 3);
      expect(dupError.errors.some((e: string) => e.includes('مكرر داخل الملف'))).toBe(true);
    });

    it('باركود مكرر مع باركود موجود بالفعل يُرفض في التحقق', async () => {
      const tenant = await registerTenant();
      await request(server)
        .post('/api/v1/products')
        .set(auth(tenant.accessToken))
        .send({
          sku: `IMP-${unique()}`,
          name: 'منتج بباركود',
          costPrice: 1,
          sellingPrice: 2,
          barcodes: ['1112223334445'],
        })
        .expect(201);

      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price', 'Barcode'],
        [[`IMP-${unique()}`, 'منتج آخر', 5, 8, '1112223334445']],
      );
      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      const validated = await validateJob(tenant, created.body.id).expect(201);
      expect(validated.body.errorRows).toBe(1);
      expect(validated.body.validationErrors[0].errors).toContain(
        'الباركود مستخدم بالفعل في هذه المنشأة',
      );
    });
  });

  // ---------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------

  describe('ربط الأعمدة (Mapping)', () => {
    it('يرفض حفظ ربط ينقصه حقل مطلوب', async () => {
      const tenant = await registerTenant();
      const buffer = await buildXlsxBuffer(['A', 'B'], [['x', 'y']]);
      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      await setMapping(tenant, created.body.id, { sku: 0 }).expect(400);
    });

    it('يرفض فهرس عمود خارج النطاق', async () => {
      const tenant = await registerTenant();
      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price'],
        [[`IMP-${unique()}`, 'منتج', 5, 8]],
      );
      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      await setMapping(tenant, created.body.id, {
        sku: 0,
        name: 1,
        costPrice: 2,
        sellingPrice: 99,
      }).expect(400);
    });
  });

  // ---------------------------------------------------------------------
  // Customers / Suppliers
  // ---------------------------------------------------------------------

  describe('استيراد عملاء وموردين', () => {
    it('يستورد عملاء بنجاح', async () => {
      const tenant = await registerTenant();
      const name = `عميل مستورد ${unique()}`;
      const buffer = await buildXlsxBuffer(['Name', 'Phone'], [[name, '0500000000']]);
      const created = await uploadJob(tenant, 'customers', buffer).expect(201);
      await validateJob(tenant, created.body.id).expect(201);
      const confirmed = await confirmJob(tenant, created.body.id).expect(201);
      expect(confirmed.body.importedRows).toBe(1);

      const customers = await request(server)
        .get('/api/v1/customers')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(customers.body.data.some((c: any) => c.name === name)).toBe(true);
    });

    it('يستورد موردين بنجاح', async () => {
      const tenant = await registerTenant();
      const name = `مورد مستورد ${unique()}`;
      const buffer = await buildXlsxBuffer(['Name'], [[name]]);
      const created = await uploadJob(tenant, 'suppliers', buffer).expect(201);
      await validateJob(tenant, created.body.id).expect(201);
      const confirmed = await confirmJob(tenant, created.body.id).expect(201);
      expect(confirmed.body.importedRows).toBe(1);

      const suppliers = await request(server)
        .get('/api/v1/suppliers')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(suppliers.body.data.some((s: any) => s.name === name)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // Opening stock
  // ---------------------------------------------------------------------

  describe('استيراد رصيد افتتاحي للمخزون', () => {
    it('يضبط رصيد المخزون الافتتاحي عبر InventoryService.setOpeningBalance الموجود', async () => {
      const tenant = await registerTenant();
      const product = await request(server)
        .post('/api/v1/products')
        .set(auth(tenant.accessToken))
        .send({ sku: `IMP-${unique()}`, name: 'منتج للمخزون', costPrice: 1, sellingPrice: 2 })
        .expect(201);

      const buffer = await buildXlsxBuffer(['SKU', 'Quantity'], [[product.body.sku, 50]]);
      const created = await uploadJob(tenant, 'opening_stock', buffer, {
        targetWarehouseId: tenant.warehouseId,
      }).expect(201);
      await validateJob(tenant, created.body.id).expect(201);
      const confirmed = await confirmJob(tenant, created.body.id).expect(201);
      expect(confirmed.body.importedRows).toBe(1);

      const stockLevels = await request(server)
        .get('/api/v1/inventory/stock-levels')
        .set(auth(tenant.accessToken))
        .expect(200);
      const line = stockLevels.body.data.find((s: any) => s.productSku === product.body.sku);
      expect(Number(line.quantityOnHand)).toBe(50);
    });

    it('يرفض إنشاء مهمة رصيد افتتاحي بلا مستودع مستهدف', async () => {
      const tenant = await registerTenant();
      const buffer = await buildXlsxBuffer(['SKU', 'Quantity'], [['X', 1]]);
      await uploadJob(tenant, 'opening_stock', buffer).expect(400);
    });

    it('عضو مقيَّد بفرع آخر لا يستطيع استيراد رصيد افتتاحي لمستودع خارج نطاقه', async () => {
      const tenant = await registerTenant();
      const product = await request(server)
        .post('/api/v1/products')
        .set(auth(tenant.accessToken))
        .send({ sku: `IMP-${unique()}`, name: 'منتج نطاق', costPrice: 1, sellingPrice: 2 })
        .expect(201);

      const otherBranch = await createBranch(tenant.accessToken);
      const otherWarehouse = await createWarehouse(tenant.accessToken, otherBranch.id);
      const scoped = await createScopedUser(tenant, 'Manager', otherBranch.id);

      // targetWarehouseId belongs to the tenant (passes ownership check at
      // upload time) but is OUTSIDE the scoped user's branch - the row must
      // fail at Confirm via InventoryService's own branch-scope check, not
      // bypass it.
      const buffer = await buildXlsxBuffer(['SKU', 'Quantity'], [[product.body.sku, 10]]);
      const created = await uploadJob(tenant, 'opening_stock', buffer, {
        targetWarehouseId: tenant.warehouseId,
        token: scoped.accessToken,
      }).expect(201);
      await setMapping(scoped, created.body.id, { sku: 0, quantity: 1 }).expect(200);
      await validateJob(scoped, created.body.id).expect(201);
      const confirmed = await confirmJob(scoped, created.body.id).expect(201);

      expect(confirmed.body.importedRows).toBe(0);
      expect(confirmed.body.errorRows).toBe(1);
      expect(confirmed.body.validationErrors[0].errors[0]).toContain('خارج نطاق الفروع');
      void otherWarehouse;
    });
  });

  // ---------------------------------------------------------------------
  // Failure handling / file validation
  // ---------------------------------------------------------------------

  describe('التعامل مع الملفات غير الصالحة', () => {
    it('ملف ليس بصيغة xlsx حقيقية يُسجَّل كمهمة فاشلة (لا استثناء غير معالَج)', async () => {
      const tenant = await registerTenant();
      const res = await uploadJob(
        tenant,
        'products',
        Buffer.from('this is not an excel file'),
      ).expect(201);
      expect(res.body.status).toBe('failed');
      expect(res.body.failureReason).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------
  // Idempotency / retry
  // ---------------------------------------------------------------------

  describe('Idempotency وإعادة المحاولة', () => {
    it('نفس clientReferenceId عند الرفع يُرجع نفس المهمة دون رفع مضاعف', async () => {
      const tenant = await registerTenant();
      const clientReferenceId = unique();
      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price'],
        [[`IMP-${unique()}`, 'منتج', 5, 8]],
      );
      const first = await uploadJob(tenant, 'products', buffer, { clientReferenceId }).expect(201);
      const second = await uploadJob(tenant, 'products', buffer, { clientReferenceId }).expect(201);
      expect(second.body.id).toBe(first.body.id);
    });

    it('استدعاء Confirm أكثر من مرة لا يستورد الصفوف مرتين', async () => {
      const tenant = await registerTenant();
      const sku = `IMP-${unique()}`;
      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price'],
        [[sku, 'منتج', 5, 8]],
      );
      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      await validateJob(tenant, created.body.id).expect(201);
      await confirmJob(tenant, created.body.id).expect(201);
      const secondConfirm = await confirmJob(tenant, created.body.id).expect(201);
      expect(secondConfirm.body.status).toBe('completed');
      expect(secondConfirm.body.importedRows).toBe(1);

      const products = await request(server)
        .get('/api/v1/products')
        .set(auth(tenant.accessToken))
        .query({ search: sku })
        .expect(200);
      expect(products.body.data.filter((p: any) => p.sku === sku)).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------
  // Tenant isolation / IDOR / RBAC
  // ---------------------------------------------------------------------

  describe('عزل المستأجرين وحماية IDOR والصلاحيات', () => {
    it('منشأة أخرى لا تستطيع الوصول إلى مهمة استيراد منشأة أولى (404)', async () => {
      const tenantA = await registerTenant();
      const tenantB = await registerTenant();
      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price'],
        [[`IMP-${unique()}`, 'منتج', 5, 8]],
      );
      const created = await uploadJob(tenantA, 'products', buffer).expect(201);
      const jobId = created.body.id;

      await request(server)
        .get(`/api/v1/imports/jobs/${jobId}`)
        .set(auth(tenantB.accessToken))
        .expect(404);
      await setMapping(tenantB, jobId, { sku: 0, name: 1, costPrice: 2, sellingPrice: 3 }).expect(
        404,
      );
      await request(server)
        .get(`/api/v1/imports/jobs/${jobId}/preview`)
        .set(auth(tenantB.accessToken))
        .expect(404);
      await validateJob(tenantB, jobId).expect(404);
      await confirmJob(tenantB, jobId).expect(404);
    });

    it('عضو بلا صلاحية import.create لا يستطيع رفع ملف استيراد (403)', async () => {
      const tenant = await registerTenant();
      const cashier = await createScopedUser(tenant, 'Cashier', null);
      const buffer = await buildXlsxBuffer(['SKU'], [['X']]);
      await uploadJob(tenant, 'products', buffer, { token: cashier.accessToken }).expect(403);
    });

    it('عضو بلا صلاحية import.read لا يستطيع عرض سجل عمليات الاستيراد (403)', async () => {
      const tenant = await registerTenant();
      const cashier = await createScopedUser(tenant, 'Cashier', null);
      await request(server).get('/api/v1/imports/jobs').set(auth(cashier.accessToken)).expect(403);
    });
  });

  // ---------------------------------------------------------------------
  // File storage isolation
  // ---------------------------------------------------------------------

  describe('عزل تخزين الملفات', () => {
    it('كل ملف مرفوع يُخزَّن تحت مسار خاص بمنشأته (companyId) ومعرّف مهمته', async () => {
      const tenant = await registerTenant();
      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price'],
        [[`IMP-${unique()}`, 'منتج', 5, 8]],
      );
      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      expect(created.body.fileKey).toBe(
        `imports/${tenant.companyId}/${created.body.id}/source.xlsx`,
      );
    });

    it('لا يوجد أي Endpoint لتنزيل ملف استيراد خام مباشرة', async () => {
      const tenant = await registerTenant();
      const buffer = await buildXlsxBuffer(['SKU'], [['X']]);
      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      await request(server)
        .get(`/api/v1/imports/jobs/${created.body.id}/file`)
        .set(auth(tenant.accessToken))
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------

  describe('إلغاء عملية الاستيراد', () => {
    it('يمكن إلغاء مهمة جاهزة، ولا يمكن تأكيدها بعد الإلغاء', async () => {
      const tenant = await registerTenant();
      const buffer = await buildXlsxBuffer(
        ['SKU', 'Name', 'Cost Price', 'Selling Price'],
        [[`IMP-${unique()}`, 'منتج', 5, 8]],
      );
      const created = await uploadJob(tenant, 'products', buffer).expect(201);
      await request(server)
        .post(`/api/v1/imports/jobs/${created.body.id}/cancel`)
        .set(auth(tenant.accessToken))
        .expect(201);
      await validateJob(tenant, created.body.id).expect(409);
    });
  });
});
