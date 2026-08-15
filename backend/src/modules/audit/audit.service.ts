import { Injectable } from '@nestjs/common';
import { TenantClient } from '../../common/prisma/prisma.service';

export interface AuditLogInput {
  companyId: string;
  actorUserId?: string | null;
  branchId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | null;
}

/**
 * Explicit audit calls from services, not a blanket interceptor: sensitive
 * actions (role changes, integration connect/disconnect, later: price
 * overrides, voids, stock adjustments) need real before/after state, which
 * only the service performing the change actually has. A generic
 * "log every mutating request" interceptor would either miss that state or
 * drown the log in noise from routine CRUD.
 */
@Injectable()
export class AuditService {
  async log(tx: TenantClient, input: AuditLogInput) {
    return tx.auditLog.create({
      data: {
        companyId: input.companyId,
        actorUserId: input.actorUserId ?? null,
        branchId: input.branchId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        beforeState: (input.beforeState ?? undefined) as any,
        afterState: (input.afterState ?? undefined) as any,
        reason: input.reason ?? null,
      },
    });
  }

  async list(
    tx: TenantClient,
    companyId: string,
    params: { page: number; pageSize: number; entityType?: string },
  ) {
    const where = {
      companyId,
      ...(params.entityType ? { entityType: params.entityType } : {}),
    };
    const [data, total] = await Promise.all([
      tx.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      tx.auditLog.count({ where }),
    ]);
    return { data, meta: { page: params.page, pageSize: params.pageSize, total } };
  }
}
