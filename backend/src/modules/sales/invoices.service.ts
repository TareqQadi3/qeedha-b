import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { paginate, paginationSkip } from '../../common/utils/pagination';
import { BranchScopeService } from '../iam/branch-scope.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { QueryInvoicesDto } from './dto/query-invoices.dto';

const INVOICE_INCLUDE = {
  sale: { include: { items: true, payments: true } },
  customer: true,
} satisfies Prisma.InvoiceInclude;

/**
 * Read-only in Phase 3: invoices are only ever created inside
 * SalesService.createSale (docs/INVOICES.md) - there is no standalone
 * "create invoice" endpoint, so this service has no write methods.
 */
@Injectable()
export class InvoicesService {
  constructor(private readonly branchScopeService: BranchScopeService) {}

  async list(tx: TenantClient, companyId: string, membershipId: string, query: QueryInvoicesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.INVOICES_READ,
    );

    const where: Prisma.InvoiceWhereInput = {
      companyId,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(!scope.allBranches ? { branchId: { in: Array.from(scope.branchIds) } } : {}),
    };

    const [data, total] = await Promise.all([
      tx.invoice.findMany({
        where,
        include: INVOICE_INCLUDE,
        orderBy: { issuedAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      tx.invoice.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async getOwnedForMembership(
    tx: TenantClient,
    companyId: string,
    membershipId: string,
    id: string,
  ) {
    const scope = await this.branchScopeService.getScopeForPermission(
      tx,
      membershipId,
      PERMISSION_KEYS.INVOICES_READ,
    );
    const invoice = await tx.invoice.findFirst({
      where: { id, companyId },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    if (!scope.allBranches && !scope.branchIds.has(invoice.branchId)) {
      throw new ForbiddenException('هذه الفاتورة خارج نطاق الفروع المصرح بها لهذه العضوية');
    }
    return invoice;
  }
}
