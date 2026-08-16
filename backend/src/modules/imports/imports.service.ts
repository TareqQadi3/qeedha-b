import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportEntityType, ImportJobStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService, TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/catalog.service';
import { ProductsService } from '../catalog/products.service';
import { InventoryService } from '../inventory/inventory.service';
import { CustomersService } from '../parties/customers.service';
import { SuppliersService } from '../parties/suppliers.service';
import { StorageService } from '../storage/storage.service';
import {
  IMPORT_FIELD_DEFS,
  ImportFieldDef,
  normalizeHeader,
  suggestMapping,
} from './constants/import-field-defs';
import { MAX_STORED_VALIDATION_ERRORS, PREVIEW_SAMPLE_ROWS } from './constants/import-limits';
import { CreateImportJobDto } from './dto/create-import-job.dto';
import { QueryImportJobsDto } from './dto/query-import-jobs.dto';
import { SetImportMappingDto } from './dto/set-import-mapping.dto';
import { ExcelParserService } from './excel-parser.service';
import {
  RawCell,
  isValidBarcodeFormat,
  readMapped,
  toNumberOrUndefined,
  toSanitizedTextOrUndefined,
  toStringOrUndefined,
} from './row-value-helpers';

export interface RowValidationResult {
  /** 1-based row number as it appears in the spreadsheet (data row 1 = row 2, right after the header). */
  rowNumber: number;
  valid: boolean;
  errors: string[];
  /** Resolved field values (post-mapping, pre-persist) - shown back to the user in Preview, never full raw row dumps. */
  values: Record<string, RawCell>;
  /** Ready-to-use payload for the target service call. Only set when valid. */
  payload?: Record<string, unknown>;
}

interface ValidationSummary {
  totalRows: number;
  validRowCount: number;
  errorRowCount: number;
  results: RowValidationResult[];
}

const JOB_ENTITY_TARGETS: Record<ImportEntityType, string> = {
  products: 'Product',
  barcodes: 'ProductBarcode',
  categories: 'ProductCategory',
  units: 'Unit',
  customers: 'Customer',
  suppliers: 'Supplier',
  opening_stock: 'StockMovement',
};

/**
 * Excel Import (Milestone 3). Three methods manage their own transaction
 * lifecycle via PrismaService directly instead of receiving `tx` from the
 * controller like every other service in this codebase - createJob(),
 * runValidation(), and confirmImport(). This is a deliberate exception:
 * each is a multi-step operation whose intermediate status (ANALYZING,
 * VALIDATING, IMPORTING) needs to actually commit and become visible to a
 * concurrent GET before the step's work finishes - a single controller-owned
 * transaction would hide those transitions until the whole request
 * completes. confirmImport() additionally runs each row's creation in its
 * OWN transaction so one row's failure (a stale duplicate, a race with
 * another import) never rolls back rows that already succeeded - see
 * docs/IMPORT_EXCEL.md "Import" for the full reasoning. Every other method here
 * (setMapping, preview, cancel, list, getOwned) is a single round trip and
 * keeps the normal tx-from-controller convention.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly excelParserService: ExcelParserService,
    private readonly catalogService: CatalogService,
    private readonly productsService: ProductsService,
    private readonly customersService: CustomersService,
    private readonly suppliersService: SuppliersService,
    private readonly inventoryService: InventoryService,
  ) {}

  // ---------------------------------------------------------------------
  // Read / lifecycle-simple operations (tx supplied by controller)
  // ---------------------------------------------------------------------

  async list(tx: TenantClient, companyId: string, query: QueryImportJobsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ImportJobWhereInput = {
      companyId,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [data, total] = await Promise.all([
      tx.importJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.importJob.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async getOwned(tx: TenantClient, companyId: string, id: string) {
    const job = await tx.importJob.findFirst({ where: { id, companyId } });
    if (!job) throw new NotFoundException('عملية الاستيراد غير موجودة');
    return job;
  }

  async getByClientReference(tx: TenantClient, companyId: string, clientReferenceId: string) {
    const job = await tx.importJob.findUnique({
      where: { companyId_clientReferenceId: { companyId, clientReferenceId } },
    });
    if (!job) throw new NotFoundException('عملية الاستيراد غير موجودة');
    return job;
  }

  isDuplicateClientReference(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  fieldDefsFor(entityType: ImportEntityType): ImportFieldDef[] {
    return IMPORT_FIELD_DEFS[entityType];
  }

  async setMapping(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    id: string,
    dto: SetImportMappingDto,
  ) {
    const job = await this.getOwned(tx, companyId, id);
    if (!['ready', 'validated'].includes(job.status)) {
      throw new ConflictException('لا يمكن تعديل ربط الأعمدة في الحالة الحالية لعملية الاستيراد');
    }

    const fieldDefs = this.fieldDefsFor(job.entityType);
    const detectedColumns = (job.detectedColumns as string[] | null) ?? [];

    const missing = fieldDefs.filter((f) => f.required && dto.mapping[f.field] === undefined);
    if (missing.length > 0) {
      throw new BadRequestException(
        `حقول مطلوبة غير مربوطة بأي عمود: ${missing.map((f) => f.label).join('، ')}`,
      );
    }
    for (const [field, index] of Object.entries(dto.mapping)) {
      if (!Number.isInteger(index) || index < 0 || index >= detectedColumns.length) {
        throw new BadRequestException(`فهرس عمود غير صالح للحقل "${field}"`);
      }
    }

    const updated = await tx.importJob.update({
      where: { id },
      data: {
        columnMapping: dto.mapping as unknown as Prisma.InputJsonValue,
        status: 'ready',
        validRows: null,
        errorRows: null,
        validationErrors: Prisma.JsonNull,
        validatedAt: null,
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'imports.job.mapping.set',
      entityType: 'ImportJob',
      entityId: id,
      afterState: { mapping: dto.mapping },
    });

    return updated;
  }

  /** Fully read-only - re-parses the stored file and validates every row in memory, but writes nothing (not even to the job row itself). */
  async preview(tx: TenantClient, companyId: string, id: string) {
    const job = await this.getOwned(tx, companyId, id);
    if (!job.columnMapping) {
      throw new BadRequestException('يجب تحديد ربط الأعمدة أولًا قبل المعاينة');
    }

    const buffer = await this.storageService.read(job.fileKey);
    const sheet = await this.excelParserService.parse(buffer);
    const mapping = job.columnMapping as unknown as Record<string, number>;

    const summary = await this.validateRows(tx, companyId, job, mapping, sheet.rows);

    return {
      jobId: job.id,
      entityType: job.entityType,
      totalRows: summary.totalRows,
      validRowCount: summary.validRowCount,
      errorRowCount: summary.errorRowCount,
      sample: summary.results.slice(0, PREVIEW_SAMPLE_ROWS),
      errorSample: summary.results.filter((r) => !r.valid).slice(0, MAX_STORED_VALIDATION_ERRORS),
    };
  }

  async cancel(tx: TenantClient, companyId: string, actorUserId: string, id: string) {
    const job = await this.getOwned(tx, companyId, id);
    if (!['uploaded', 'ready', 'validated', 'failed'].includes(job.status)) {
      throw new ConflictException('لا يمكن إلغاء عملية استيراد قيد التنفيذ أو مكتملة بالفعل');
    }
    const updated = await tx.importJob.update({ where: { id }, data: { status: 'cancelled' } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'imports.job.cancel',
      entityType: 'ImportJob',
      entityId: id,
    });
    return updated;
  }

  // ---------------------------------------------------------------------
  // Multi-step operations (self-managed transactions)
  // ---------------------------------------------------------------------

  async createJob(
    companyId: string,
    actorMembershipId: string,
    actorUserId: string,
    dto: CreateImportJobDto,
    file: { buffer: Buffer; originalname: string; size: number },
  ) {
    if (dto.clientReferenceId) {
      const existing = await this.prisma.withTenant(companyId, (tx) =>
        tx.importJob.findUnique({
          where: {
            companyId_clientReferenceId: { companyId, clientReferenceId: dto.clientReferenceId! },
          },
        }),
      );
      if (existing) return existing;
    }

    if (dto.entityType === 'opening_stock') {
      if (!dto.targetWarehouseId) {
        throw new BadRequestException('يجب تحديد المستودع لاستيراد الرصيد الافتتاحي');
      }
      await this.prisma.withTenant(companyId, (tx) =>
        this.inventoryService.assertWarehouseOwned(tx, companyId, dto.targetWarehouseId!),
      );
    }

    const jobId = randomUUID();
    const fileKey = this.storageService.buildImportFileKey(companyId, jobId);

    let job = await this.prisma.withTenant(companyId, (tx) =>
      tx.importJob.create({
        data: {
          id: jobId,
          companyId,
          actorMembershipId,
          actorUserId,
          entityType: dto.entityType,
          targetWarehouseId: dto.targetWarehouseId ?? null,
          status: 'uploaded',
          fileKey,
          originalFilename: this.storageService.sanitizeDisplayFilename(file.originalname),
          fileSizeBytes: file.size,
          clientReferenceId: dto.clientReferenceId ?? null,
        },
      }),
    );

    await this.storageService.save(fileKey, file.buffer);
    await this.prisma.withTenant(companyId, (tx) =>
      this.auditService.log(tx, {
        companyId,
        actorUserId,
        action: 'imports.job.upload',
        entityType: 'ImportJob',
        entityId: jobId,
        afterState: { entityType: dto.entityType, originalFilename: job.originalFilename },
      }),
    );

    job = await this.prisma.withTenant(companyId, (tx) =>
      tx.importJob.update({ where: { id: jobId }, data: { status: 'analyzing' } }),
    );

    try {
      const sheet = await this.excelParserService.parse(file.buffer);
      const fieldDefs = this.fieldDefsFor(dto.entityType);
      const suggested = suggestMapping(sheet.headers, fieldDefs);

      job = await this.prisma.withTenant(companyId, (tx) =>
        tx.importJob.update({
          where: { id: jobId },
          data: {
            status: 'ready',
            detectedColumns: sheet.headers as unknown as Prisma.InputJsonValue,
            columnMapping: suggested as unknown as Prisma.InputJsonValue,
            totalRows: sheet.rows.length,
          },
        }),
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'تعذّر تحليل الملف';
      job = await this.prisma.withTenant(companyId, (tx) =>
        tx.importJob.update({
          where: { id: jobId },
          data: { status: 'failed', failureReason: reason },
        }),
      );
    }

    return job;
  }

  async runValidation(companyId: string, actorUserId: string, id: string) {
    let job = await this.prisma.withTenant(companyId, (tx) => this.getOwned(tx, companyId, id));
    if (!['ready', 'validated'].includes(job.status)) {
      throw new ConflictException('يجب أن تكون عملية الاستيراد في حالة "جاهزة" قبل التحقق');
    }
    if (!job.columnMapping) {
      throw new BadRequestException('يجب تحديد ربط الأعمدة أولًا قبل التحقق');
    }

    job = await this.prisma.withTenant(companyId, (tx) =>
      tx.importJob.update({ where: { id }, data: { status: 'validating' } }),
    );

    const buffer = await this.storageService.read(job.fileKey);
    const sheet = await this.excelParserService.parse(buffer);
    const mapping = job.columnMapping as unknown as Record<string, number>;

    const summary = await this.prisma.withTenant(companyId, (tx) =>
      this.validateRows(tx, companyId, job, mapping, sheet.rows),
    );

    job = await this.prisma.withTenant(companyId, (tx) =>
      tx.importJob.update({
        where: { id },
        data: {
          status: 'validated',
          totalRows: summary.totalRows,
          validRows: summary.validRowCount,
          errorRows: summary.errorRowCount,
          validationErrors: summary.results
            .filter((r) => !r.valid)
            .slice(0, MAX_STORED_VALIDATION_ERRORS) as unknown as Prisma.InputJsonValue,
          validatedAt: new Date(),
        },
      }),
    );

    await this.prisma.withTenant(companyId, (tx) =>
      this.auditService.log(tx, {
        companyId,
        actorUserId,
        action: 'imports.job.validate',
        entityType: 'ImportJob',
        entityId: id,
        afterState: { validRows: summary.validRowCount, errorRows: summary.errorRowCount },
      }),
    );

    return job;
  }

  async confirmImport(
    companyId: string,
    actorMembershipId: string,
    actorUserId: string,
    id: string,
  ) {
    let job = await this.prisma.withTenant(companyId, (tx) => this.getOwned(tx, companyId, id));

    // Idempotent at the job level too - a retry of an already-running or
    // already-finished confirm returns the current state instead of
    // re-importing.
    if (['importing', 'completed'].includes(job.status)) return job;
    if (job.status !== 'validated') {
      throw new ConflictException('يجب التحقق من صحة البيانات قبل تأكيد الاستيراد');
    }
    if (!job.columnMapping) {
      throw new BadRequestException('يجب تحديد ربط الأعمدة أولًا');
    }

    job = await this.prisma.withTenant(companyId, (tx) =>
      tx.importJob.update({ where: { id }, data: { status: 'importing' } }),
    );

    await this.prisma.withTenant(companyId, (tx) =>
      this.auditService.log(tx, {
        companyId,
        actorUserId,
        action: 'imports.job.import.start',
        entityType: 'ImportJob',
        entityId: id,
      }),
    );

    // Re-validate fresh against current DB state (docs/IMPORT_EXCEL.md
    // "Import") - time may have passed since Validate, and another import
    // or manual entry could have changed which SKUs/references now exist.
    const buffer = await this.storageService.read(job.fileKey);
    const sheet = await this.excelParserService.parse(buffer);
    const mapping = job.columnMapping as unknown as Record<string, number>;
    const summary = await this.prisma.withTenant(companyId, (tx) =>
      this.validateRows(tx, companyId, job, mapping, sheet.rows),
    );

    let importedCount = 0;
    const importErrors: RowValidationResult[] = [];

    for (const row of summary.results) {
      if (!row.valid || !row.payload) {
        if (!row.valid) importErrors.push(row);
        continue;
      }
      try {
        await this.prisma.withTenant(companyId, (tx) =>
          this.createRow(
            tx,
            companyId,
            actorMembershipId,
            actorUserId,
            job.entityType,
            job,
            row.payload!,
          ),
        );
        importedCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'فشل غير متوقع أثناء الاستيراد';
        importErrors.push({ ...row, valid: false, errors: [message] });
      }
    }

    const finalStatus: ImportJobStatus = 'completed';
    job = await this.prisma.withTenant(companyId, (tx) =>
      tx.importJob.update({
        where: { id },
        data: {
          status: finalStatus,
          importedRows: importedCount,
          errorRows: importErrors.length,
          validRows: summary.validRowCount,
          validationErrors: importErrors.slice(
            0,
            MAX_STORED_VALIDATION_ERRORS,
          ) as unknown as Prisma.InputJsonValue,
          importedAt: new Date(),
        },
      }),
    );

    await this.prisma.withTenant(companyId, (tx) =>
      this.auditService.log(tx, {
        companyId,
        actorUserId,
        action: 'imports.job.import.complete',
        entityType: 'ImportJob',
        entityId: id,
        afterState: {
          entityTarget: JOB_ENTITY_TARGETS[job.entityType],
          importedRows: importedCount,
          errorRows: importErrors.length,
        },
      }),
    );

    return job;
  }

  private async createRow(
    tx: TenantClient,
    companyId: string,
    actorMembershipId: string,
    actorUserId: string,
    entityType: ImportEntityType,
    job: { targetWarehouseId: string | null },
    payload: Record<string, unknown>,
  ) {
    switch (entityType) {
      case 'products':
        return this.productsService.create(tx, companyId, actorUserId, payload as any);
      case 'barcodes':
        return this.productsService.addBarcode(
          tx,
          companyId,
          actorUserId,
          payload.productId as string,
          payload.barcode as string,
        );
      case 'categories':
        return this.catalogService.createCategory(tx, companyId, actorUserId, payload as any);
      case 'units':
        return this.catalogService.createUnit(tx, companyId, actorUserId, payload as any);
      case 'customers':
        return this.customersService.create(tx, companyId, actorUserId, payload as any);
      case 'suppliers':
        return this.suppliersService.create(tx, companyId, actorUserId, payload as any);
      case 'opening_stock':
        return this.inventoryService.setOpeningBalance(
          tx,
          companyId,
          actorMembershipId,
          actorUserId,
          {
            warehouseId: job.targetWarehouseId!,
            productId: payload.productId as string,
            quantity: payload.quantity as number,
            notes: payload.notes as string | undefined,
          },
        );
    }
  }

  // ---------------------------------------------------------------------
  // Row validation dispatch
  // ---------------------------------------------------------------------

  private async validateRows(
    tx: TenantClient,
    companyId: string,
    job: { entityType: ImportEntityType; targetWarehouseId: string | null },
    mapping: Record<string, number>,
    rawRows: RawCell[][],
  ): Promise<ValidationSummary> {
    let results: RowValidationResult[];
    switch (job.entityType) {
      case 'products':
        results = await this.validateProductsRows(tx, companyId, mapping, rawRows);
        break;
      case 'barcodes':
        results = await this.validateBarcodesRows(tx, companyId, mapping, rawRows);
        break;
      case 'categories':
        results = await this.validateCategoriesRows(tx, companyId, mapping, rawRows);
        break;
      case 'units':
        results = await this.validateUnitsRows(tx, companyId, mapping, rawRows);
        break;
      case 'customers':
        results = await this.validatePartyRows(tx, companyId, mapping, rawRows, 'customer');
        break;
      case 'suppliers':
        results = await this.validatePartyRows(tx, companyId, mapping, rawRows, 'supplier');
        break;
      case 'opening_stock':
        results = await this.validateOpeningStockRows(tx, companyId, mapping, rawRows);
        break;
      default:
        throw new BadRequestException(`نوع استيراد غير مدعوم: ${job.entityType}`);
    }

    const validRowCount = results.filter((r) => r.valid).length;
    return {
      totalRows: results.length,
      validRowCount,
      errorRowCount: results.length - validRowCount,
      results,
    };
  }

  private async validateProductsRows(
    tx: TenantClient,
    companyId: string,
    mapping: Record<string, number>,
    rawRows: RawCell[][],
  ): Promise<RowValidationResult[]> {
    const skuCandidates: string[] = [];
    const barcodeCandidates: string[] = [];
    for (const row of rawRows) {
      const sku = toStringOrUndefined(readMapped(row, mapping, 'sku'));
      if (sku) skuCandidates.push(sku);
      const barcode = toStringOrUndefined(readMapped(row, mapping, 'barcode'));
      if (barcode) barcodeCandidates.push(barcode);
    }

    const [existingProducts, existingBarcodes, categories, brands, units] = await Promise.all([
      tx.product.findMany({
        where: { companyId, sku: { in: skuCandidates } },
        select: { sku: true },
      }),
      tx.productBarcode.findMany({
        where: { companyId, barcode: { in: barcodeCandidates } },
        select: { barcode: true },
      }),
      tx.productCategory.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, name: true },
      }),
      tx.brand.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, name: true },
      }),
      tx.unit.findMany({ where: { companyId, deletedAt: null }, select: { id: true, name: true } }),
    ]);
    const existingSkuSet = new Set(existingProducts.map((p) => p.sku));
    const existingBarcodeSet = new Set(existingBarcodes.map((b) => b.barcode));
    const categoryByName = new Map(categories.map((c) => [normalizeHeader(c.name), c.id]));
    const brandByName = new Map(brands.map((b) => [normalizeHeader(b.name), b.id]));
    const unitByName = new Map(units.map((u) => [normalizeHeader(u.name), u.id]));

    const seenSkus = new Map<string, number>();
    const seenBarcodes = new Map<string, number>();
    const results: RowValidationResult[] = [];

    rawRows.forEach((row, i) => {
      const rowNumber = i + 2;
      const errors: string[] = [];

      const sku = toStringOrUndefined(readMapped(row, mapping, 'sku'));
      const name = toSanitizedTextOrUndefined(readMapped(row, mapping, 'name'));
      const costPrice = toNumberOrUndefined(readMapped(row, mapping, 'costPrice'));
      const sellingPrice = toNumberOrUndefined(readMapped(row, mapping, 'sellingPrice'));
      const categoryName = toStringOrUndefined(readMapped(row, mapping, 'categoryName'));
      const brandName = toStringOrUndefined(readMapped(row, mapping, 'brandName'));
      const unitName = toStringOrUndefined(readMapped(row, mapping, 'unitName'));
      const barcode = toStringOrUndefined(readMapped(row, mapping, 'barcode'));
      const vatRate = toNumberOrUndefined(readMapped(row, mapping, 'vatRate'));
      const minStockThreshold = toNumberOrUndefined(readMapped(row, mapping, 'minStockThreshold'));

      if (!sku) errors.push('SKU مطلوب');
      if (!name || name.length < 2) errors.push('اسم المنتج مطلوب (حرفان على الأقل)');
      if (costPrice === undefined) errors.push('سعر التكلفة مطلوب');
      else if (costPrice < 0) errors.push('سعر التكلفة يجب ألا يقل عن صفر');
      if (sellingPrice === undefined) errors.push('سعر البيع مطلوب');
      else if (sellingPrice < 0) errors.push('سعر البيع يجب ألا يقل عن صفر');
      if (vatRate !== undefined && (vatRate < 0 || vatRate > 100)) {
        errors.push('نسبة الضريبة يجب أن تكون بين 0 و100');
      }
      if (minStockThreshold !== undefined && minStockThreshold < 0) {
        errors.push('الحد الأدنى للمخزون يجب ألا يقل عن صفر');
      }

      if (sku) {
        if (seenSkus.has(sku)) errors.push(`SKU مكرر داخل الملف (الصف ${seenSkus.get(sku)})`);
        else seenSkus.set(sku, rowNumber);
        if (existingSkuSet.has(sku)) errors.push('SKU مستخدم بالفعل في هذه المنشأة');
      }

      let categoryId: string | undefined;
      if (categoryName) {
        categoryId = categoryByName.get(normalizeHeader(categoryName));
        if (!categoryId) errors.push(`التصنيف غير موجود: ${categoryName}`);
      }
      let brandId: string | undefined;
      if (brandName) {
        brandId = brandByName.get(normalizeHeader(brandName));
        if (!brandId) errors.push(`العلامة التجارية غير موجودة: ${brandName}`);
      }
      let unitId: string | undefined;
      if (unitName) {
        unitId = unitByName.get(normalizeHeader(unitName));
        if (!unitId) errors.push(`الوحدة غير موجودة: ${unitName}`);
      }

      if (barcode) {
        if (!isValidBarcodeFormat(barcode))
          errors.push('الباركود يجب أن يحتوي أحرفًا وأرقامًا فقط');
        if (seenBarcodes.has(barcode)) {
          errors.push(`الباركود مكرر داخل الملف (الصف ${seenBarcodes.get(barcode)})`);
        } else seenBarcodes.set(barcode, rowNumber);
        if (existingBarcodeSet.has(barcode)) errors.push('الباركود مستخدم بالفعل في هذه المنشأة');
      }

      const values: Record<string, RawCell> = {
        sku: sku ?? null,
        name: name ?? null,
        costPrice: costPrice ?? null,
        sellingPrice: sellingPrice ?? null,
        categoryName: categoryName ?? null,
        brandName: brandName ?? null,
        unitName: unitName ?? null,
        barcode: barcode ?? null,
      };

      if (errors.length === 0) {
        results.push({
          rowNumber,
          valid: true,
          errors: [],
          values,
          payload: {
            sku,
            name,
            costPrice,
            sellingPrice,
            categoryId,
            brandId,
            unitId,
            vatRate,
            minStockThreshold,
            barcodes: barcode ? [barcode] : undefined,
          },
        });
      } else {
        results.push({ rowNumber, valid: false, errors, values });
      }
    });

    return results;
  }

  private async validateBarcodesRows(
    tx: TenantClient,
    companyId: string,
    mapping: Record<string, number>,
    rawRows: RawCell[][],
  ): Promise<RowValidationResult[]> {
    const skuCandidates = rawRows
      .map((row) => toStringOrUndefined(readMapped(row, mapping, 'sku')))
      .filter((v): v is string => !!v);
    const barcodeCandidates = rawRows
      .map((row) => toStringOrUndefined(readMapped(row, mapping, 'barcode')))
      .filter((v): v is string => !!v);

    const [products, existingBarcodes] = await Promise.all([
      tx.product.findMany({
        where: { companyId, sku: { in: skuCandidates }, deletedAt: null },
        select: { id: true, sku: true },
      }),
      tx.productBarcode.findMany({
        where: { companyId, barcode: { in: barcodeCandidates } },
        select: { barcode: true },
      }),
    ]);
    const productBySku = new Map(products.map((p) => [p.sku, p.id]));
    const existingBarcodeSet = new Set(existingBarcodes.map((b) => b.barcode));

    const seenBarcodes = new Map<string, number>();
    const results: RowValidationResult[] = [];

    rawRows.forEach((row, i) => {
      const rowNumber = i + 2;
      const errors: string[] = [];
      const sku = toStringOrUndefined(readMapped(row, mapping, 'sku'));
      const barcode = toStringOrUndefined(readMapped(row, mapping, 'barcode'));

      if (!sku) errors.push('SKU مطلوب');
      if (!barcode) errors.push('الباركود مطلوب');

      let productId: string | undefined;
      if (sku) {
        productId = productBySku.get(sku);
        if (!productId) errors.push(`المنتج غير موجود بهذا الـSKU: ${sku}`);
      }
      if (barcode) {
        if (!isValidBarcodeFormat(barcode))
          errors.push('الباركود يجب أن يحتوي أحرفًا وأرقامًا فقط');
        if (seenBarcodes.has(barcode)) {
          errors.push(`الباركود مكرر داخل الملف (الصف ${seenBarcodes.get(barcode)})`);
        } else seenBarcodes.set(barcode, rowNumber);
        if (existingBarcodeSet.has(barcode)) errors.push('الباركود مستخدم بالفعل في هذه المنشأة');
      }

      const values: Record<string, RawCell> = { sku: sku ?? null, barcode: barcode ?? null };
      if (errors.length === 0) {
        results.push({
          rowNumber,
          valid: true,
          errors: [],
          values,
          payload: { productId, barcode },
        });
      } else {
        results.push({ rowNumber, valid: false, errors, values });
      }
    });

    return results;
  }

  private async validateCategoriesRows(
    tx: TenantClient,
    companyId: string,
    mapping: Record<string, number>,
    rawRows: RawCell[][],
  ): Promise<RowValidationResult[]> {
    const existingCategories = await tx.productCategory.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    const categoryByName = new Map(existingCategories.map((c) => [normalizeHeader(c.name), c.id]));

    const seenNames = new Map<string, number>();
    const results: RowValidationResult[] = [];

    rawRows.forEach((row, i) => {
      const rowNumber = i + 2;
      const errors: string[] = [];
      const name = toSanitizedTextOrUndefined(readMapped(row, mapping, 'name'));
      const parentName = toStringOrUndefined(readMapped(row, mapping, 'parentName'));

      if (!name) errors.push('اسم التصنيف مطلوب');
      if (name) {
        const key = normalizeHeader(name);
        if (seenNames.has(key)) errors.push(`اسم مكرر داخل الملف (الصف ${seenNames.get(key)})`);
        else seenNames.set(key, rowNumber);
      }

      let parentId: string | undefined;
      if (parentName) {
        parentId = categoryByName.get(normalizeHeader(parentName));
        if (!parentId) errors.push(`التصنيف الأب غير موجود: ${parentName}`);
      }

      const values: Record<string, RawCell> = {
        name: name ?? null,
        parentName: parentName ?? null,
      };
      if (errors.length === 0) {
        results.push({ rowNumber, valid: true, errors: [], values, payload: { name, parentId } });
      } else {
        results.push({ rowNumber, valid: false, errors, values });
      }
    });

    return results;
  }

  private async validateUnitsRows(
    tx: TenantClient,
    companyId: string,
    mapping: Record<string, number>,
    rawRows: RawCell[][],
  ): Promise<RowValidationResult[]> {
    const existingUnits = await tx.unit.findMany({
      where: { companyId, deletedAt: null },
      select: { name: true },
    });
    const existingNames = new Set(existingUnits.map((u) => normalizeHeader(u.name)));

    const seenNames = new Map<string, number>();
    const results: RowValidationResult[] = [];

    rawRows.forEach((row, i) => {
      const rowNumber = i + 2;
      const errors: string[] = [];
      const name = toSanitizedTextOrUndefined(readMapped(row, mapping, 'name'));
      const symbol = toSanitizedTextOrUndefined(readMapped(row, mapping, 'symbol'));

      if (!name) errors.push('اسم الوحدة مطلوب');
      if (name) {
        const key = normalizeHeader(name);
        if (seenNames.has(key)) errors.push(`اسم مكرر داخل الملف (الصف ${seenNames.get(key)})`);
        else seenNames.set(key, rowNumber);
        if (existingNames.has(key)) errors.push('اسم الوحدة مستخدم بالفعل في هذه المنشأة');
      }

      const values: Record<string, RawCell> = { name: name ?? null, symbol: symbol ?? null };
      if (errors.length === 0) {
        results.push({ rowNumber, valid: true, errors: [], values, payload: { name, symbol } });
      } else {
        results.push({ rowNumber, valid: false, errors, values });
      }
    });

    return results;
  }

  private async validatePartyRows(
    tx: TenantClient,
    companyId: string,
    mapping: Record<string, number>,
    rawRows: RawCell[][],
    party: 'customer' | 'supplier',
  ): Promise<RowValidationResult[]> {
    const referenceCandidates = rawRows
      .map((row) => toStringOrUndefined(readMapped(row, mapping, 'reference')))
      .filter((v): v is string => !!v);

    const existingReferences =
      party === 'customer'
        ? await tx.customer.findMany({
            where: { companyId, reference: { in: referenceCandidates } },
            select: { reference: true },
          })
        : await tx.supplier.findMany({
            where: { companyId, reference: { in: referenceCandidates } },
            select: { reference: true },
          });
    const existingReferenceSet = new Set(
      existingReferences.map((r) => r.reference).filter((r): r is string => !!r),
    );

    const seenReferences = new Map<string, number>();
    const results: RowValidationResult[] = [];
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    rawRows.forEach((row, i) => {
      const rowNumber = i + 2;
      const errors: string[] = [];
      const name = toSanitizedTextOrUndefined(readMapped(row, mapping, 'name'));
      const phone = toSanitizedTextOrUndefined(readMapped(row, mapping, 'phone'));
      const email = toStringOrUndefined(readMapped(row, mapping, 'email'));
      const address = toSanitizedTextOrUndefined(readMapped(row, mapping, 'address'));
      const taxNumber = toSanitizedTextOrUndefined(readMapped(row, mapping, 'taxNumber'));
      const reference = toStringOrUndefined(readMapped(row, mapping, 'reference'));
      const contactPerson =
        party === 'supplier'
          ? toSanitizedTextOrUndefined(readMapped(row, mapping, 'contactPerson'))
          : undefined;

      if (!name || name.length < 2) errors.push('الاسم مطلوب (حرفان على الأقل)');
      if (email && !emailPattern.test(email)) errors.push('بريد إلكتروني غير صحيح');

      if (reference) {
        if (seenReferences.has(reference)) {
          errors.push(`رقم مرجعي مكرر داخل الملف (الصف ${seenReferences.get(reference)})`);
        } else seenReferences.set(reference, rowNumber);
        if (existingReferenceSet.has(reference))
          errors.push('رقم مرجعي مستخدم بالفعل في هذه المنشأة');
      }

      const values: Record<string, RawCell> = {
        name: name ?? null,
        phone: phone ?? null,
        email: email ?? null,
        reference: reference ?? null,
      };

      if (errors.length === 0) {
        results.push({
          rowNumber,
          valid: true,
          errors: [],
          values,
          payload: { name, phone, email, address, taxNumber, reference, contactPerson },
        });
      } else {
        results.push({ rowNumber, valid: false, errors, values });
      }
    });

    return results;
  }

  private async validateOpeningStockRows(
    tx: TenantClient,
    companyId: string,
    mapping: Record<string, number>,
    rawRows: RawCell[][],
  ): Promise<RowValidationResult[]> {
    const skuCandidates = rawRows
      .map((row) => toStringOrUndefined(readMapped(row, mapping, 'sku')))
      .filter((v): v is string => !!v);

    const products = await tx.product.findMany({
      where: { companyId, sku: { in: skuCandidates }, deletedAt: null },
      select: { id: true, sku: true },
    });
    const productBySku = new Map(products.map((p) => [p.sku, p.id]));

    const seenSkus = new Map<string, number>();
    const results: RowValidationResult[] = [];

    rawRows.forEach((row, i) => {
      const rowNumber = i + 2;
      const errors: string[] = [];
      const sku = toStringOrUndefined(readMapped(row, mapping, 'sku'));
      const quantity = toNumberOrUndefined(readMapped(row, mapping, 'quantity'));
      const notes = toSanitizedTextOrUndefined(readMapped(row, mapping, 'notes'));

      if (!sku) errors.push('SKU مطلوب');
      if (quantity === undefined) errors.push('الكمية مطلوبة');
      else if (quantity < 0) errors.push('الكمية يجب ألا تقل عن صفر');

      let productId: string | undefined;
      if (sku) {
        if (seenSkus.has(sku)) errors.push(`SKU مكرر داخل الملف (الصف ${seenSkus.get(sku)})`);
        else seenSkus.set(sku, rowNumber);
        productId = productBySku.get(sku);
        if (!productId) errors.push(`المنتج غير موجود بهذا الـSKU: ${sku}`);
      }

      const values: Record<string, RawCell> = { sku: sku ?? null, quantity: quantity ?? null };
      if (errors.length === 0) {
        results.push({
          rowNumber,
          valid: true,
          errors: [],
          values,
          payload: { productId, quantity, notes },
        });
      } else {
        results.push({ rowNumber, valid: false, errors, values });
      }
    });

    return results;
  }
}
