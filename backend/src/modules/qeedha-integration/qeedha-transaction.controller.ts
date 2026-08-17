import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ResolveCustomerDto } from './dto/resolve-customer.dto';
import { SubmitTransactionDto } from './dto/submit-transaction.dto';
import { CurrentIntegrationConnection } from './current-integration-connection.decorator';
import {
  AuthenticatedIntegrationConnection,
  QeedhaIntegrationAuthGuard,
} from './qeedha-integration-auth.guard';
import { QeedhaTransactionService } from './qeedha-transaction.service';

/**
 * The EXTERNAL-facing API surface (Milestone 9 spec section 4) - callable
 * by Qeedha, never by a merchant's own browser session. `@Public()` skips
 * the normal JWT/Membership/Permissions/Subscription guard chain entirely
 * (there is no JWT here); `QeedhaIntegrationAuthGuard` is this controller's
 * OWN, complete authentication+tenant-resolution layer, applied explicitly.
 * Every handler derives companyId ONLY from `@CurrentIntegrationConnection()`
 * - no route here accepts a companyId/tenant parameter from the caller.
 */
@Public()
@UseGuards(QeedhaIntegrationAuthGuard)
@Controller('qeedha-integration')
export class QeedhaTransactionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionService: QeedhaTransactionService,
  ) {}

  @Post('customers/resolve')
  resolveCustomer(
    @CurrentIntegrationConnection() connection: AuthenticatedIntegrationConnection,
    @Body() dto: ResolveCustomerDto,
  ) {
    return this.prisma.withTenant(connection.companyId, (tx) =>
      this.transactionService.resolveCustomer(tx, connection, dto),
    );
  }

  /**
   * Same catch-and-refetch race handling as SalesController.createSale: the
   * genuinely-concurrent case (two identical requests racing past the
   * pre-check simultaneously) loses on `Payment.clientReferenceId`'s unique
   * constraint deep inside `recordExternalPayment` - caught here, re-fetched
   * by idempotencyKey, and returned instead of surfacing as an error. See
   * Milestone 9 spec section 8.
   */
  // Higher than the global default (100/60s, still IP-keyed - see
  // docs/INTEGRATION.md "Rate limiting" for the honest limitation this
  // carries when many merchants' traffic shares Qeedha's outbound IP(s))
  // since this is the legitimate high-frequency path, unlike connection
  // management.
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post('transactions')
  async submitTransaction(
    @CurrentIntegrationConnection() connection: AuthenticatedIntegrationConnection,
    @Body() dto: SubmitTransactionDto,
  ) {
    try {
      return await this.prisma.withTenant(connection.companyId, (tx) =>
        this.transactionService.submitTransaction(tx, connection, dto),
      );
    } catch (err) {
      if (this.transactionService.isDuplicateKey(err)) {
        return this.prisma.withTenant(connection.companyId, (tx) =>
          this.transactionService.lookup(tx, connection, dto.idempotencyKey),
        );
      }
      throw err;
    }
  }

  @Get('transactions/:reference')
  lookup(
    @CurrentIntegrationConnection() connection: AuthenticatedIntegrationConnection,
    @Param('reference') reference: string,
  ) {
    return this.prisma.withTenant(connection.companyId, (tx) =>
      this.transactionService.lookup(tx, connection, reference),
    );
  }

  @Post('transactions/:reference/cancel')
  cancel(
    @CurrentIntegrationConnection() connection: AuthenticatedIntegrationConnection,
    @Param('reference') reference: string,
  ) {
    return this.prisma.withTenant(connection.companyId, (tx) =>
      this.transactionService.cancel(tx, connection, reference),
    );
  }
}
