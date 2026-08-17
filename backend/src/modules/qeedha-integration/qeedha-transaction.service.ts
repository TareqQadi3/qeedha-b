import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { round2 } from '../../common/utils/money';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../parties/customers.service';
import { SalesService } from '../sales/sales.service';
import { ResolveCustomerDto } from './dto/resolve-customer.dto';
import { SubmitTransactionDto } from './dto/submit-transaction.dto';
import { AuthenticatedIntegrationConnection } from './qeedha-integration-auth.guard';
import { QEEDHA_PROVIDER_KEY } from './constants/qeedha-integration.constants';

/**
 * The adapter/orchestration layer Milestone 9 spec section 7 asks for -
 * "Do NOT duplicate SaleService logic... an adapter/orchestration layer".
 * Every write of real financial/inventory state happens exclusively through
 * `SalesService.recordExternalPayment` (itself just the existing, proven
 * `recordPayment` locking/overpayment/journal-posting logic, reused byte for
 * byte - see sales.service.ts). This service's only job is: resolve external
 * references to internal rows, validate them against each other, and call
 * that one trusted entry point - never compute an amount, never touch
 * inventory/COGS/journal lines directly.
 */
@Injectable()
export class QeedhaTransactionService {
  constructor(
    private readonly customersService: CustomersService,
    private readonly salesService: SalesService,
    private readonly auditService: AuditService,
  ) {}

  isDuplicateKey(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  /**
   * External Customer Reference <-> Customer (Milestone 9 spec section 5).
   * A Postgres advisory lock (transaction-scoped, released on commit/
   * rollback) serializes concurrent resolve() calls for the exact SAME
   * reference - the mapping's own unique constraint alone only catches the
   * race AFTER a duplicate Customer row would already have been created;
   * this closes that window without an in-memory lock (spec section 20:
   * "Do not solve concurrency with an in-memory lock").
   */
  async resolveCustomer(
    tx: TenantClient,
    connection: AuthenticatedIntegrationConnection,
    dto: ResolveCustomerDto,
  ) {
    const { companyId, connectionId } = connection;
    const lockKey = `qeedha-integration-customer:${companyId}:${connectionId}:${dto.externalCustomerReference}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const existing = await tx.integrationCustomerMapping.findUnique({
      where: {
        companyId_connectionId_externalCustomerReference: {
          companyId,
          connectionId,
          externalCustomerReference: dto.externalCustomerReference,
        },
      },
      include: { customer: true },
    });
    if (existing) {
      return {
        externalCustomerReference: dto.externalCustomerReference,
        customerName: existing.customer.name,
        resolved: true,
        created: false,
      };
    }

    if (!dto.name) {
      throw new NotFoundException(
        'لم يتم العثور على عميل بهذا المرجع الخارجي - الاسم مطلوب لإنشاء عميل جديد',
      );
    }

    const systemUserId = await this.getSystemUserId(tx, connection.systemMembershipId);

    // Best-effort transparency only (docs/QEEDHA_INTEGRATION.md "Customer
    // mapping"): `Customer.reference` is a free-text, merchant-editable
    // field, never the authoritative lookup - IntegrationCustomerMapping
    // always is. Skip setting it if already taken rather than failing.
    const referenceTaken = await tx.customer.findFirst({
      where: { companyId, reference: dto.externalCustomerReference },
    });

    const customer = await this.customersService.create(tx, companyId, systemUserId, {
      name: dto.name,
      phone: dto.mobile,
      email: dto.email,
      reference: referenceTaken ? undefined : dto.externalCustomerReference,
    });

    await tx.integrationCustomerMapping.create({
      data: {
        companyId,
        connectionId,
        externalCustomerReference: dto.externalCustomerReference,
        customerId: customer.id,
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId: systemUserId,
      action: 'qeedha_integration.customer.resolve',
      entityType: 'IntegrationCustomerMapping',
      entityId: customer.id,
      afterState: { externalCustomerReference: dto.externalCustomerReference, created: true },
    });

    return {
      externalCustomerReference: dto.externalCustomerReference,
      customerName: customer.name,
      resolved: true,
      created: true,
    };
  }

  /**
   * The core transaction flow (Milestone 9 spec sections 7-9). Idempotency
   * check first (fast path for a true retry after the original already
   * committed); the genuinely-concurrent case is caught by
   * `Payment.clientReferenceId`'s unique constraint inside
   * `recordExternalPayment` (same proven pattern as every other
   * idempotent write in this codebase) and handled by the CONTROLLER's
   * catch-and-refetch, exactly like SalesController.createSale.
   */
  async submitTransaction(
    tx: TenantClient,
    connection: AuthenticatedIntegrationConnection,
    dto: SubmitTransactionDto,
  ) {
    const { companyId, connectionId } = connection;

    if (dto.externalMerchantId !== connection.publicReference) {
      throw new BadRequestException('معرّف التاجر الخارجي لا يطابق رابط التكامل المصادَق عليه');
    }

    const existingTransaction = await tx.integrationTransaction.findUnique({
      where: {
        companyId_connectionId_idempotencyKey: {
          companyId,
          connectionId,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (existingTransaction) {
      return this.toResponse(existingTransaction);
    }

    const branch = await tx.branch.findFirst({
      where: { companyId, code: dto.branchReference, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('مرجع الفرع الخارجي غير معروف لهذه المنشأة');
    }

    const invoice = await tx.invoice.findFirst({
      where: { companyId, invoiceNumber: dto.invoiceReference },
    });
    if (!invoice) {
      throw new NotFoundException('مرجع الفاتورة الخارجي غير معروف لهذه المنشأة');
    }

    const sale = await tx.sale.findFirst({ where: { id: invoice.saleId, companyId } });
    if (!sale) {
      throw new NotFoundException('عملية البيع المرتبطة بهذه الفاتورة غير موجودة');
    }
    if (sale.branchId !== branch.id) {
      throw new ConflictException('مرجع الفرع الخارجي لا يطابق الفرع الفعلي لهذه الفاتورة');
    }
    if (dto.currencyCode.toUpperCase() !== sale.currency.toUpperCase()) {
      throw new BadRequestException('رمز العملة لا يطابق عملة الفاتورة');
    }

    const customerMapping = await tx.integrationCustomerMapping.findUnique({
      where: {
        companyId_connectionId_externalCustomerReference: {
          companyId,
          connectionId,
          externalCustomerReference: dto.externalCustomerReference,
        },
      },
    });
    if (!customerMapping) {
      throw new NotFoundException(
        'العميل الخارجي غير مُحلَّل بعد - استدعِ /customers/resolve أولًا',
      );
    }
    if (sale.customerId && sale.customerId !== customerMapping.customerId) {
      throw new ConflictException('العميل الخارجي لا يطابق عميل هذه الفاتورة');
    }

    const systemUserId = await this.getSystemUserId(tx, connection.systemMembershipId);

    let saleResult: Awaited<ReturnType<typeof this.salesService.recordExternalPayment>>;
    try {
      saleResult = await this.salesService.recordExternalPayment(
        tx,
        companyId,
        connection.systemMembershipId,
        systemUserId,
        sale.id,
        {
          amount: dto.amount,
          providerKey: QEEDHA_PROVIDER_KEY,
          externalReference: dto.externalTransactionId,
          idempotencyKey: dto.idempotencyKey,
        },
      );
    } catch (err) {
      // A genuine business-rule rejection (e.g. overpayment because the
      // invoice was already settled through another channel between
      // validation above and this call) becomes a stored FAILED transaction
      // - never a fake PENDING, never a silent 500 (Milestone 9 spec
      // section 9).
      if (this.isDuplicateKey(err)) throw err; // let the controller's race handler take it
      const failureReason = err instanceof Error ? err.message : 'فشل غير معروف';
      const failed = await tx.integrationTransaction.create({
        data: {
          companyId,
          connectionId,
          branchId: branch.id,
          saleId: sale.id,
          customerId: customerMapping.customerId,
          externalTransactionId: dto.externalTransactionId,
          idempotencyKey: dto.idempotencyKey,
          status: 'failed',
          amount: dto.amount,
          currencyCode: dto.currencyCode,
          invoiceReference: dto.invoiceReference,
          branchReference: dto.branchReference,
          failureReason,
        },
      });
      await this.auditService.log(tx, {
        companyId,
        actorUserId: systemUserId,
        branchId: branch.id,
        action: 'qeedha_integration.transaction.fail',
        entityType: 'IntegrationTransaction',
        entityId: failed.id,
        afterState: { externalTransactionId: dto.externalTransactionId, failureReason },
      });
      return this.toResponse(failed);
    }

    const transaction = await tx.integrationTransaction.create({
      data: {
        companyId,
        connectionId,
        branchId: branch.id,
        saleId: sale.id,
        paymentId: saleResult.payment.id,
        customerId: customerMapping.customerId,
        externalTransactionId: dto.externalTransactionId,
        idempotencyKey: dto.idempotencyKey,
        status: 'success',
        amount: dto.amount,
        currencyCode: dto.currencyCode,
        invoiceReference: dto.invoiceReference,
        branchReference: dto.branchReference,
      },
    });

    await this.auditService.log(tx, {
      companyId,
      actorUserId: systemUserId,
      branchId: branch.id,
      action: 'qeedha_integration.transaction.create',
      entityType: 'IntegrationTransaction',
      entityId: transaction.id,
      afterState: {
        externalTransactionId: dto.externalTransactionId,
        amount: dto.amount,
        saleId: sale.id,
        paymentId: saleResult.payment.id,
      },
    });

    return this.toResponse(transaction);
  }

  /** Tenant/connection-isolated by construction - every query below is scoped to `connection.companyId`/`connection.connectionId`, never a raw id lookup. */
  async lookup(
    tx: TenantClient,
    connection: AuthenticatedIntegrationConnection,
    reference: string,
  ) {
    const transaction = await this.findByReference(tx, connection, reference);
    if (!transaction) throw new NotFoundException('لم يتم العثور على معاملة بهذا المرجع');
    return this.toResponse(transaction);
  }

  /**
   * Deterministic, documented cancellation rule (Milestone 9 spec section
   * 11): a FAILED transaction never touched real money/inventory, so
   * marking it cancelled is always safe. A SUCCESS transaction already
   * posted a real Payment + journal entry via the exact same trusted path
   * `recordPayment` uses - no existing mechanism in this codebase reverses
   * a SINGLE settled AR payment in isolation (only a full Sale cancellation
   * exists, which would also incorrectly leave this payment's own journal
   * entry unreversed). Rather than invent new reversal accounting logic
   * (explicitly out of scope: "do NOT create a new cancellation/accounting
   * engine"), this returns a real, permanent, idempotent 409 instead of
   * pretending to reverse it.
   */
  async cancel(
    tx: TenantClient,
    connection: AuthenticatedIntegrationConnection,
    reference: string,
  ) {
    const transaction = await this.findByReference(tx, connection, reference);
    if (!transaction) throw new NotFoundException('لم يتم العثور على معاملة بهذا المرجع');

    if (transaction.status === 'cancelled') {
      return this.toResponse(transaction);
    }

    if (transaction.status === 'failed') {
      const systemUserId = await this.getSystemUserId(tx, connection.systemMembershipId);
      const cancelled = await tx.integrationTransaction.update({
        where: { id: transaction.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      await this.auditService.log(tx, {
        companyId: connection.companyId,
        actorUserId: systemUserId,
        action: 'qeedha_integration.transaction.cancel',
        entityType: 'IntegrationTransaction',
        entityId: cancelled.id,
        beforeState: { status: 'failed' },
        afterState: { status: 'cancelled' },
      });
      return this.toResponse(cancelled);
    }

    throw new ConflictException(
      'لا يمكن إلغاء معاملة مكتملة عبر هذا التكامل - القواعد المحاسبية الحالية لا تسمح بعكس دفعة واحدة مُسدَّدة بمعزل عن العملية الأصلية. يرجى التواصل مع الدعم.',
    );
  }

  private async findByReference(
    tx: TenantClient,
    connection: AuthenticatedIntegrationConnection,
    reference: string,
  ) {
    const byIdempotencyKey = await tx.integrationTransaction.findUnique({
      where: {
        companyId_connectionId_idempotencyKey: {
          companyId: connection.companyId,
          connectionId: connection.connectionId,
          idempotencyKey: reference,
        },
      },
    });
    if (byIdempotencyKey) return byIdempotencyKey;

    return tx.integrationTransaction.findFirst({
      where: {
        companyId: connection.companyId,
        connectionId: connection.connectionId,
        externalTransactionId: reference,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getSystemUserId(tx: TenantClient, systemMembershipId: string): Promise<string> {
    const membership = await tx.membership.findUniqueOrThrow({
      where: { id: systemMembershipId },
      select: { userId: true },
    });
    return membership.userId;
  }

  private toResponse(transaction: {
    status: string;
    externalTransactionId: string;
    idempotencyKey: string;
    amount: Prisma.Decimal;
    currencyCode: string;
    invoiceReference: string;
    failureReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      status: transaction.status.toUpperCase(),
      externalTransactionId: transaction.externalTransactionId,
      transactionReference: transaction.idempotencyKey,
      amount: round2(Number(transaction.amount)).toFixed(2),
      currency: transaction.currencyCode,
      invoiceReference: transaction.invoiceReference,
      failureReason: transaction.failureReason,
      processedAt: transaction.updatedAt,
    };
  }
}
