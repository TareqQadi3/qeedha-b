import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { AuditService } from '../audit/audit.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { QueryPartiesDto } from './dto/query-parties.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly auditService: AuditService) {}

  async list(tx: TenantClient, companyId: string, query: QueryPartiesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.CustomerWhereInput = {
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
      tx.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.customer.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async getOwned(tx: TenantClient, companyId: string, id: string) {
    const customer = await tx.customer.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('العميل غير موجود');
    return customer;
  }

  async create(tx: TenantClient, companyId: string, actorUserId: string, dto: CreateCustomerDto) {
    if (dto.reference) await this.assertReferenceAvailable(tx, companyId, dto.reference);

    const customer = await tx.customer.create({ data: { companyId, ...dto } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'customers.customer.create',
      entityType: 'Customer',
      entityId: customer.id,
      afterState: { name: customer.name, phone: customer.phone },
    });
    return customer;
  }

  async update(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    id: string,
    dto: UpdateCustomerDto,
  ) {
    const before = await this.getOwned(tx, companyId, id);
    if (dto.reference && dto.reference !== before.reference) {
      await this.assertReferenceAvailable(tx, companyId, dto.reference);
    }

    const customer = await tx.customer.update({ where: { id }, data: dto });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'customers.customer.update',
      entityType: 'Customer',
      entityId: id,
      beforeState: { name: before.name, phone: before.phone },
      afterState: { name: customer.name, phone: customer.phone },
    });
    return customer;
  }

  async softDelete(tx: TenantClient, companyId: string, actorUserId: string, id: string) {
    await this.getOwned(tx, companyId, id);
    await tx.customer.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'customers.customer.delete',
      entityType: 'Customer',
      entityId: id,
    });
    return { success: true };
  }

  private async assertReferenceAvailable(tx: TenantClient, companyId: string, reference: string) {
    const existing = await tx.customer.findFirst({ where: { companyId, reference } });
    if (existing) throw new ConflictException('رقم مرجع العميل مستخدم بالفعل في هذه المنشأة');
  }
}
