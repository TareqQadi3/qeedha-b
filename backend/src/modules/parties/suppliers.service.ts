import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { AuditService } from '../audit/audit.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { QueryPartiesDto } from './dto/query-parties.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly auditService: AuditService) {}

  async list(tx: TenantClient, companyId: string, query: QueryPartiesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.SupplierWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { phone: { contains: query.search } },
              { reference: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      tx.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.supplier.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async getOwned(tx: TenantClient, companyId: string, id: string) {
    const supplier = await tx.supplier.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!supplier) throw new NotFoundException('المورد غير موجود');
    return supplier;
  }

  async create(tx: TenantClient, companyId: string, actorUserId: string, dto: CreateSupplierDto) {
    if (dto.reference) await this.assertReferenceAvailable(tx, companyId, dto.reference);

    const supplier = await tx.supplier.create({ data: { companyId, ...dto } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'suppliers.supplier.create',
      entityType: 'Supplier',
      entityId: supplier.id,
      afterState: { name: supplier.name, phone: supplier.phone },
    });
    return supplier;
  }

  async update(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    id: string,
    dto: UpdateSupplierDto,
  ) {
    const before = await this.getOwned(tx, companyId, id);
    if (dto.reference && dto.reference !== before.reference) {
      await this.assertReferenceAvailable(tx, companyId, dto.reference);
    }

    const supplier = await tx.supplier.update({ where: { id }, data: dto });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'suppliers.supplier.update',
      entityType: 'Supplier',
      entityId: id,
      beforeState: { name: before.name, phone: before.phone },
      afterState: { name: supplier.name, phone: supplier.phone },
    });
    return supplier;
  }

  async softDelete(tx: TenantClient, companyId: string, actorUserId: string, id: string) {
    await this.getOwned(tx, companyId, id);
    await tx.supplier.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'suppliers.supplier.delete',
      entityType: 'Supplier',
      entityId: id,
    });
    return { success: true };
  }

  private async assertReferenceAvailable(tx: TenantClient, companyId: string, reference: string) {
    const existing = await tx.supplier.findFirst({ where: { companyId, reference } });
    if (existing) throw new ConflictException('رقم مرجع المورد مستخدم بالفعل في هذه المنشأة');
  }
}
