import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantClient } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreatePosDeviceDto } from './dto/create-pos-device.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';

@Injectable()
export class TenancyService {
  constructor(
    private readonly auditService: AuditService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  listBranches(tx: TenantClient, companyId: string) {
    return tx.branch.findMany({ where: { companyId, deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async createBranch(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    dto: CreateBranchDto,
  ) {
    // Milestone 8: usage limit (plan.maxBranches) - locks+counts before the
    // uniqueness check/insert below, inside this same transaction, so two
    // concurrent requests can never jointly exceed the plan's branch limit.
    await this.subscriptionService.assertWithinLimit(tx, companyId, 'branches');

    const existing = await tx.branch.findFirst({ where: { companyId, code: dto.code } });
    if (existing) throw new ConflictException('رمز الفرع مستخدم بالفعل');

    const branch = await tx.branch.create({
      data: {
        companyId,
        name: dto.name,
        code: dto.code,
        address: dto.address,
        isDefault: dto.isDefault ?? false,
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'tenancy.branch.create',
      entityType: 'Branch',
      entityId: branch.id,
      afterState: branch,
    });

    return branch;
  }

  listWarehouses(tx: TenantClient, companyId: string) {
    return tx.warehouse.findMany({
      where: { companyId, deletedAt: null },
      include: { branch: true },
      orderBy: { name: 'asc' },
    });
  }

  async createWarehouse(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    dto: CreateWarehouseDto,
  ) {
    // Phase 13: usage limit (plan.maxWarehouses / subscription override) -
    // same locked-count-before-insert pattern as createBranch above.
    await this.subscriptionService.assertWithinLimit(tx, companyId, 'warehouses');

    const branch = await tx.branch.findFirst({
      where: { id: dto.branchId, companyId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('الفرع غير موجود');

    const existing = await tx.warehouse.findFirst({ where: { companyId, code: dto.code } });
    if (existing) throw new ConflictException('رمز المستودع مستخدم بالفعل');

    const warehouse = await tx.warehouse.create({
      data: {
        companyId,
        branchId: dto.branchId,
        name: dto.name,
        code: dto.code,
        isDefault: dto.isDefault ?? false,
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId: dto.branchId,
      action: 'tenancy.warehouse.create',
      entityType: 'Warehouse',
      entityId: warehouse.id,
      afterState: warehouse,
    });

    return warehouse;
  }

  listPosDevices(tx: TenantClient, companyId: string) {
    return tx.posDevice.findMany({
      where: { companyId, deletedAt: null },
      include: { branch: true },
      orderBy: { name: 'asc' },
    });
  }

  async createPosDevice(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    dto: CreatePosDeviceDto,
  ) {
    const branch = await tx.branch.findFirst({
      where: { id: dto.branchId, companyId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('الفرع غير موجود');

    const existing = await tx.posDevice.findFirst({
      where: { companyId, deviceCode: dto.deviceCode },
    });
    if (existing) throw new ConflictException('رمز الجهاز مستخدم بالفعل');

    const device = await tx.posDevice.create({
      data: { companyId, branchId: dto.branchId, name: dto.name, deviceCode: dto.deviceCode },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      branchId: dto.branchId,
      action: 'tenancy.pos_device.create',
      entityType: 'PosDevice',
      entityId: device.id,
      afterState: device,
    });

    return device;
  }
}
