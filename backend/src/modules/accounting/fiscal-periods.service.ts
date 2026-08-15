import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantClient } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateFiscalPeriodDto } from './dto/create-fiscal-period.dto';

/** Anchors a date-only value to UTC midnight, matching how `@db.Date` columns round-trip through Prisma. */
function dateOnly(value: string | Date): Date {
  const iso = typeof value === 'string' ? value : value.toISOString();
  return new Date(iso.slice(0, 10) + 'T00:00:00.000Z');
}

/**
 * Simple, extensible period lock (docs/ACCOUNTING.md "Fiscal Periods").
 * Closing a period never touches any posted JournalEntry - it only changes
 * whether JournalService will accept a *new* post/reversal (which always
 * posts at "now", there is no backdating) while today falls inside it.
 */
@Injectable()
export class FiscalPeriodsService {
  constructor(private readonly auditService: AuditService) {}

  async list(tx: TenantClient, companyId: string) {
    return tx.fiscalPeriod.findMany({ where: { companyId }, orderBy: { startDate: 'desc' } });
  }

  async create(
    tx: TenantClient,
    companyId: string,
    actorUserId: string,
    dto: CreateFiscalPeriodDto,
  ) {
    const startDate = dateOnly(dto.startDate);
    const endDate = dateOnly(dto.endDate);
    if (startDate > endDate) {
      throw new BadRequestException('تاريخ بداية الفترة يجب أن يسبق تاريخ نهايتها');
    }

    const overlapping = await tx.fiscalPeriod.findFirst({
      where: { companyId, startDate: { lte: endDate }, endDate: { gte: startDate } },
    });
    if (overlapping) {
      throw new ConflictException(`تتقاطع هذه الفترة مع فترة موجودة: ${overlapping.name}`);
    }

    const period = await tx.fiscalPeriod.create({
      data: { companyId, name: dto.name, startDate, endDate },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'accounting.period.create',
      entityType: 'FiscalPeriod',
      entityId: period.id,
      afterState: { name: period.name, startDate: dto.startDate, endDate: dto.endDate },
    });

    return period;
  }

  async close(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    actorUserId: string,
    id: string,
  ) {
    const period = await tx.fiscalPeriod.findFirst({ where: { id, companyId } });
    if (!period) throw new NotFoundException('الفترة المحاسبية غير موجودة');
    if (period.status === 'closed') throw new ConflictException('الفترة مُقفلة بالفعل');

    const updated = await tx.fiscalPeriod.update({
      where: { id },
      data: { status: 'closed', closedAt: new Date(), closedByMembershipId: membershipId },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'accounting.period.close',
      entityType: 'FiscalPeriod',
      entityId: id,
      beforeState: { status: 'open' },
      afterState: { status: 'closed' },
    });

    return updated;
  }

  async reopen(tx: TenantClient, companyId: string, actorUserId: string, id: string) {
    const period = await tx.fiscalPeriod.findFirst({ where: { id, companyId } });
    if (!period) throw new NotFoundException('الفترة المحاسبية غير موجودة');
    if (period.status === 'open') throw new ConflictException('الفترة مفتوحة بالفعل');

    const updated = await tx.fiscalPeriod.update({
      where: { id },
      data: { status: 'open', closedAt: null, closedByMembershipId: null },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId,
      action: 'accounting.period.reopen',
      entityType: 'FiscalPeriod',
      entityId: id,
      beforeState: { status: 'closed' },
      afterState: { status: 'open' },
    });

    return updated;
  }

  /** Used by JournalService before every post/reversal - throws if "today" falls inside a closed period. */
  async assertTodayNotLocked(tx: TenantClient, companyId: string) {
    const today = dateOnly(new Date());
    const closedPeriod = await tx.fiscalPeriod.findFirst({
      where: { companyId, status: 'closed', startDate: { lte: today }, endDate: { gte: today } },
    });
    if (closedPeriod) {
      throw new ConflictException(
        `لا يمكن ترحيل أو عكس قيد محاسبي: الفترة المحاسبية "${closedPeriod.name}" مُقفلة`,
      );
    }
  }
}
