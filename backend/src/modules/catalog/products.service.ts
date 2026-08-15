import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const PRODUCT_INCLUDE = {
  category: true,
  brand: true,
  unit: true,
  barcodes: true,
} as const;

@Injectable()
export class ProductsService {
  constructor(
    private readonly auditService: AuditService,
    private readonly catalogService: CatalogService,
  ) {}

  async list(tx: TenantClient, companyId: string, query: QueryProductsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where = {
      companyId,
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { sku: { contains: query.search, mode: 'insensitive' as const } },
              { barcodes: { some: { barcode: { contains: query.search } } } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      tx.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { [query.sortBy ?? 'name']: query.sortOrder ?? 'asc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.product.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async getOwned(tx: TenantClient, companyId: string, id: string) {
    const product = await tx.product.findFirst({
      where: { id, companyId, deletedAt: null },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    return product;
  }

  async create(tx: TenantClient, companyId: string, actorUserId: string, dto: CreateProductDto) {
    await this.assertReferencesOwnedByTenant(tx, companyId, dto);

    const existingSku = await tx.product.findFirst({ where: { companyId, sku: dto.sku } });
    if (existingSku) throw new ConflictException('SKU مستخدم بالفعل في هذه المنشأة');

    if (dto.barcodes?.length) {
      await this.assertBarcodesAvailable(tx, companyId, dto.barcodes);
    }

    const product = await tx.product.create({
      data: {
        companyId,
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        unitId: dto.unitId,
        costPrice: dto.costPrice,
        sellingPrice: dto.sellingPrice,
        vatRate: dto.vatRate ?? 15,
        isActive: dto.isActive ?? true,
        minStockThreshold: dto.minStockThreshold ?? 0,
        barcodes: dto.barcodes?.length
          ? { create: dto.barcodes.map((barcode) => ({ companyId, barcode })) }
          : undefined,
      },
      include: PRODUCT_INCLUDE,
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.product.create',
      entityType: 'Product',
      entityId: product.id,
      afterState: {
        sku: product.sku,
        name: product.name,
        sellingPrice: product.sellingPrice.toString(),
      },
    });

    return product;
  }

  async update(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    id: string,
    dto: UpdateProductDto,
  ) {
    const before = await this.getOwned(tx, companyId, id);
    await this.assertReferencesOwnedByTenant(tx, companyId, dto);

    if (dto.sku && dto.sku !== before.sku) {
      const existingSku = await tx.product.findFirst({
        where: { companyId, sku: dto.sku, id: { not: id } },
      });
      if (existingSku) throw new ConflictException('SKU مستخدم بالفعل في هذه المنشأة');
    }

    const product = await tx.product.update({ where: { id }, data: dto, include: PRODUCT_INCLUDE });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.product.update',
      entityType: 'Product',
      entityId: id,
      beforeState: { name: before.name, sku: before.sku },
      afterState: { name: product.name, sku: product.sku },
    });

    // Distinct, explicitly named audit events for the two changes the spec
    // calls out separately from a generic "update" (price integrity and
    // SKU/barcode changes both have compliance/trust implications beyond
    // an ordinary field edit).
    if (
      dto.sellingPrice !== undefined &&
      Number(dto.sellingPrice) !== Number(before.sellingPrice)
    ) {
      await this.auditService.log(tx, {
        companyId,
        actorUserId,
        action: 'products.product.price_change',
        entityType: 'Product',
        entityId: id,
        beforeState: {
          sellingPrice: before.sellingPrice.toString(),
          costPrice: before.costPrice.toString(),
        },
        afterState: {
          sellingPrice: product.sellingPrice.toString(),
          costPrice: product.costPrice.toString(),
        },
      });
    }
    if (dto.sku && dto.sku !== before.sku) {
      await this.auditService.log(tx, {
        companyId,
        actorUserId,
        action: 'products.product.sku_change',
        entityType: 'Product',
        entityId: id,
        beforeState: { sku: before.sku },
        afterState: { sku: product.sku },
      });
    }

    return product;
  }

  async softDelete(tx: TenantClient, companyId: string, actorUserId: string, id: string) {
    await this.getOwned(tx, companyId, id);
    await tx.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.product.delete',
      entityType: 'Product',
      entityId: id,
    });
    return { success: true };
  }

  async addBarcode(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    productId: string,
    barcode: string,
  ) {
    await this.getOwned(tx, companyId, productId);
    await this.assertBarcodesAvailable(tx, companyId, [barcode]);

    const created = await tx.productBarcode.create({ data: { companyId, productId, barcode } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.product.sku_change', // barcode changes share the same audited category as SKU changes
      entityType: 'Product',
      entityId: productId,
      afterState: { addedBarcode: barcode },
    });
    return created;
  }

  async removeBarcode(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    productId: string,
    barcodeId: string,
  ) {
    const barcode = await tx.productBarcode.findFirst({
      where: { id: barcodeId, companyId, productId },
    });
    if (!barcode) throw new NotFoundException('الباركود غير موجود');

    await tx.productBarcode.delete({ where: { id: barcodeId } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.product.sku_change',
      entityType: 'Product',
      entityId: productId,
      beforeState: { removedBarcode: barcode.barcode },
    });
    return { success: true };
  }

  private async assertBarcodesAvailable(tx: TenantClient, companyId: string, barcodes: string[]) {
    const existing = await tx.productBarcode.findFirst({
      where: { companyId, barcode: { in: barcodes } },
    });
    if (existing)
      throw new ConflictException(`الباركود "${existing.barcode}" مستخدم بالفعل في هذه المنشأة`);
  }

  /** A category/brand/unit referenced by a product must belong to the SAME tenant - never trust the id alone. */
  private async assertReferencesOwnedByTenant(
    tx: TenantClient,
    companyId: string,
    dto: Partial<CreateProductDto>,
  ) {
    if (dto.categoryId) await this.catalogService.getOwnedCategory(tx, companyId, dto.categoryId);
    if (dto.brandId) await this.catalogService.getOwnedBrand(tx, companyId, dto.brandId);
    if (dto.unitId) await this.catalogService.getOwnedUnit(tx, companyId, dto.unitId);
  }
}
