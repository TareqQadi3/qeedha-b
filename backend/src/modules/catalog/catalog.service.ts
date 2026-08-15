import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantClient } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

/** Units, Brands, and hierarchical Categories - the small reference tables Products hang off. */
@Injectable()
export class CatalogService {
  constructor(private readonly auditService: AuditService) {}

  // ---- Units --------------------------------------------------------------

  listUnits(tx: TenantClient, companyId: string) {
    return tx.unit.findMany({ where: { companyId, deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async createUnit(tx: TenantClient, companyId: string, actorUserId: string, dto: CreateUnitDto) {
    const existing = await tx.unit.findFirst({
      where: { companyId, name: dto.name, deletedAt: null },
    });
    if (existing) throw new ConflictException('اسم الوحدة مستخدم بالفعل');

    const unit = await tx.unit.create({ data: { companyId, name: dto.name, symbol: dto.symbol } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.unit.create',
      entityType: 'Unit',
      entityId: unit.id,
      afterState: unit,
    });
    return unit;
  }

  async updateUnit(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    id: string,
    dto: UpdateUnitDto,
  ) {
    const before = await this.getOwnedUnit(tx, companyId, id);
    const unit = await tx.unit.update({ where: { id }, data: dto });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.unit.update',
      entityType: 'Unit',
      entityId: id,
      beforeState: before,
      afterState: unit,
    });
    return unit;
  }

  async deleteUnit(tx: TenantClient, companyId: string, actorUserId: string, id: string) {
    await this.getOwnedUnit(tx, companyId, id);
    await tx.unit.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.unit.delete',
      entityType: 'Unit',
      entityId: id,
    });
    return { success: true };
  }

  async getOwnedUnit(tx: TenantClient, companyId: string, id: string) {
    const unit = await tx.unit.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!unit) throw new NotFoundException('الوحدة غير موجودة');
    return unit;
  }

  // ---- Brands ---------------------------------------------------------------

  listBrands(tx: TenantClient, companyId: string) {
    return tx.brand.findMany({ where: { companyId, deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async createBrand(tx: TenantClient, companyId: string, actorUserId: string, dto: CreateBrandDto) {
    const existing = await tx.brand.findFirst({
      where: { companyId, name: dto.name, deletedAt: null },
    });
    if (existing) throw new ConflictException('اسم العلامة التجارية مستخدم بالفعل');

    const brand = await tx.brand.create({ data: { companyId, name: dto.name } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.brand.create',
      entityType: 'Brand',
      entityId: brand.id,
      afterState: brand,
    });
    return brand;
  }

  async updateBrand(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    id: string,
    dto: UpdateBrandDto,
  ) {
    const before = await this.getOwnedBrand(tx, companyId, id);
    const brand = await tx.brand.update({ where: { id }, data: dto });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.brand.update',
      entityType: 'Brand',
      entityId: id,
      beforeState: before,
      afterState: brand,
    });
    return brand;
  }

  async deleteBrand(tx: TenantClient, companyId: string, actorUserId: string, id: string) {
    await this.getOwnedBrand(tx, companyId, id);
    await tx.brand.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.brand.delete',
      entityType: 'Brand',
      entityId: id,
    });
    return { success: true };
  }

  async getOwnedBrand(tx: TenantClient, companyId: string, id: string) {
    const brand = await tx.brand.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!brand) throw new NotFoundException('العلامة التجارية غير موجودة');
    return brand;
  }

  // ---- Categories (hierarchical) --------------------------------------------

  listCategories(tx: TenantClient, companyId: string) {
    return tx.productCategory.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    dto: CreateCategoryDto,
  ) {
    if (dto.parentId) {
      // Ownership check: a category can only nest under a category that
      // belongs to the SAME tenant - a bare FK can't express that on its
      // own, so this is enforced here explicitly (see schema.prisma comment
      // on ProductCategory).
      await this.getOwnedCategory(tx, companyId, dto.parentId);
    }

    const category = await tx.productCategory.create({
      data: { companyId, name: dto.name, parentId: dto.parentId ?? null },
    });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.category.create',
      entityType: 'ProductCategory',
      entityId: category.id,
      afterState: category,
    });
    return category;
  }

  async updateCategory(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    id: string,
    dto: UpdateCategoryDto,
  ) {
    const before = await this.getOwnedCategory(tx, companyId, id);
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new ConflictException('لا يمكن أن يكون التصنيف تابعًا لنفسه');
      }
      await this.getOwnedCategory(tx, companyId, dto.parentId);
    }

    const category = await tx.productCategory.update({ where: { id }, data: dto });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.category.update',
      entityType: 'ProductCategory',
      entityId: id,
      beforeState: before,
      afterState: category,
    });
    return category;
  }

  async deleteCategory(tx: TenantClient, companyId: string, actorUserId: string, id: string) {
    await this.getOwnedCategory(tx, companyId, id);
    await tx.productCategory.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'products.category.delete',
      entityType: 'ProductCategory',
      entityId: id,
    });
    return { success: true };
  }

  async getOwnedCategory(tx: TenantClient, companyId: string, id: string) {
    const category = await tx.productCategory.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!category) throw new NotFoundException('التصنيف غير موجود');
    return category;
  }
}
