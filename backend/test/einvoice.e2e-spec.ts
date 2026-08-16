import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

const unique = () => randomUUID().slice(0, 8);

function decodeTlv(base64: string): { tag: number; value: string }[] {
  const buffer = Buffer.from(base64, 'base64');
  const fields: { tag: number; value: string }[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const tag = buffer.readUInt8(offset);
    const length = buffer.readUInt8(offset + 1);
    const value = buffer.subarray(offset + 2, offset + 2 + length).toString('utf8');
    fields.push({ tag, value });
    offset += 2 + length;
  }
  return fields;
}

describe('Milestone 4: ZATCA E-Invoicing Readiness (e2e)', () => {
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

  const registerTenant = async (vatNumber?: string) => {
    const id = unique();
    const res = await request(server)
      .post('/api/v1/auth/register-company')
      .send({
        legalName: `متجر الفوترة ${id}`,
        ownerFullName: `مالك ${id}`,
        ownerEmail: `einvoice-${id}@test.qeedha.local`,
        password: 'SuperSecret123',
        ...(vatNumber ? { vatNumber } : {}),
      })
      .expect(201);

    const warehouses = await request(server)
      .get('/api/v1/tenancy/warehouses')
      .set(auth(res.body.accessToken))
      .expect(200);

    return {
      id,
      accessToken: res.body.accessToken as string,
      companyId: res.body.company.id as string,
      legalName: `متجر الفوترة ${id}`,
      warehouseId: warehouses.body[0].id as string,
    };
  };

  const createProduct = async (tenant: Awaited<ReturnType<typeof registerTenant>>) => {
    const res = await request(server)
      .post('/api/v1/products')
      .set(auth(tenant.accessToken))
      .send({ sku: `SKU-${unique()}`, name: `منتج ${unique()}`, costPrice: 5, sellingPrice: 10 })
      .expect(201);
    return res.body;
  };

  const setOpeningBalance = async (
    tenant: Awaited<ReturnType<typeof registerTenant>>,
    productId: string,
  ) => {
    await request(server)
      .post('/api/v1/inventory/opening-balance')
      .set(auth(tenant.accessToken))
      .send({ warehouseId: tenant.warehouseId, productId, quantity: 100 })
      .expect(201);
  };

  const createSale = async (
    tenant: Awaited<ReturnType<typeof registerTenant>>,
    productId: string,
  ) => {
    const res = await request(server)
      .post('/api/v1/sales')
      .set(auth(tenant.accessToken))
      .send({
        warehouseId: tenant.warehouseId,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: 'cash', amount: 11.5 }],
        clientReferenceId: unique(),
      })
      .expect(201);
    return res.body;
  };

  describe('توليد رمز QR (Phase 1) عند إتمام بيع', () => {
    it('ينشئ سجل امتثال (InvoiceCompliance) تلقائيًا مع رمز QR صحيح حين يملك التاجر رقمًا ضريبيًا', async () => {
      const vatNumber = '300000000000003';
      const tenant = await registerTenant(vatNumber);
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id);

      const sale = await createSale(tenant, product.id);
      const invoiceId = sale.invoice.id as string;

      const invoice = await request(server)
        .get(`/api/v1/invoices/${invoiceId}`)
        .set(auth(tenant.accessToken))
        .expect(200);

      expect(invoice.body.compliance).toBeTruthy();
      expect(invoice.body.compliance.status).toBe('not_submitted');
      expect(invoice.body.compliance.qrCode).toBeTruthy();
      expect(invoice.body.compliance.generatedAt).toBeTruthy();

      const fields = decodeTlv(invoice.body.compliance.qrCode);
      expect(fields).toEqual([
        { tag: 1, value: tenant.legalName },
        { tag: 2, value: vatNumber },
        { tag: 3, value: expect.any(String) },
        { tag: 4, value: '11.50' },
        { tag: 5, value: '1.50' },
      ]);
      // Timestamp must be a real, parseable ISO 8601 value.
      expect(new Date(fields[2].value).toString()).not.toBe('Invalid Date');
    });

    it('لا يُنشئ رمز QR حين لا يملك التاجر رقمًا ضريبيًا مسجَّلًا، لكن سجل الامتثال لا يزال يُنشأ', async () => {
      const tenant = await registerTenant(); // no vatNumber
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id);

      const sale = await createSale(tenant, product.id);
      const invoiceId = sale.invoice.id as string;

      const invoice = await request(server)
        .get(`/api/v1/invoices/${invoiceId}`)
        .set(auth(tenant.accessToken))
        .expect(200);

      expect(invoice.body.compliance).toBeTruthy();
      expect(invoice.body.compliance.status).toBe('not_submitted');
      expect(invoice.body.compliance.qrCode).toBeNull();
      expect(invoice.body.compliance.generatedAt).toBeNull();
    });

    it('يظهر رمز QR أيضًا في قائمة الفواتير (GET /invoices)', async () => {
      const tenant = await registerTenant('300000000000003');
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id);
      await createSale(tenant, product.id);

      const list = await request(server)
        .get('/api/v1/invoices')
        .set(auth(tenant.accessToken))
        .expect(200);
      expect(list.body.data[0].compliance.qrCode).toBeTruthy();
    });

    it('يُسجَّل توليد سجل الامتثال في Audit Log', async () => {
      const tenant = await registerTenant('300000000000003');
      const product = await createProduct(tenant);
      await setOpeningBalance(tenant, product.id);
      const sale = await createSale(tenant, product.id);

      const audit = await prisma.withTenant(tenant.companyId, (tx) =>
        tx.auditLog.findFirst({
          where: {
            companyId: tenant.companyId,
            action: 'einvoice.compliance.generate',
            afterState: { path: ['invoiceId'], equals: sale.invoice.id },
          },
        }),
      );
      expect(audit).toBeTruthy();
    });
  });

  describe('عزل المستأجرين', () => {
    it('منشأة أخرى لا تستطيع رؤية فاتورة (وبالتالي سجل الامتثال) منشأة أولى', async () => {
      const tenantA = await registerTenant('300000000000003');
      const tenantB = await registerTenant('300000000000004');
      const product = await createProduct(tenantA);
      await setOpeningBalance(tenantA, product.id);
      const sale = await createSale(tenantA, product.id);

      await request(server)
        .get(`/api/v1/invoices/${sale.invoice.id}`)
        .set(auth(tenantB.accessToken))
        .expect(404);
    });
  });
});
