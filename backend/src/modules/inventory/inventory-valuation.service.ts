import { Injectable } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { TenantClient } from '../../common/prisma/prisma.service';
import { round2 } from '../../common/utils/money';
import { InventoryService } from './inventory.service';

export interface ValuationMovementParams {
  warehouseId: string;
  productId: string;
  type: StockMovementType;
  referenceType?: string;
  referenceId?: string;
  actorMembershipId?: string | null;
  notes?: string;
}

/**
 * The one source of truth for inventory valuation math (docs/ACCOUNTING.md
 * "COGS / Inventory Valuation") - every caller that needs a COGS amount or a
 * receipt's resulting cost basis goes through here instead of computing it
 * itself, so there is exactly one place that knows the weighted-average
 * formula. The actual atomic write (quantity + average_cost together) still
 * lives in InventoryService.recordMovement - this service does not touch
 * stock_levels directly, it only shapes the call and interprets the result.
 */
@Injectable()
export class InventoryValuationService {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * A signed, cost-aware stock movement passed straight through to
   * `InventoryService.recordMovement` (positive `quantity` recomputes the
   * average cost; negative leaves it untouched, same rules as
   * `recordMovement` itself). Named "receipt" because its main callers are
   * always-positive (purchase receipt, opening stock, transfer-in); a signed
   * caller like StockCountService (one call handles both a "found more" and
   * a "found less" line) can still use it directly since there is no sign
   * coercion here, unlike `recordIssue` below.
   */
  async recordReceipt(
    tx: TenantClient,
    companyId: string,
    params: ValuationMovementParams & { quantity: number; unitCost?: number },
  ) {
    const { movement, quantityOnHand, averageCost } = await this.inventoryService.recordMovement(
      tx,
      companyId,
      { ...params, quantity: params.quantity, unitCost: params.unitCost },
    );
    return { movement, quantityOnHand, averageCost: Number(averageCost) };
  }

  /**
   * An outgoing movement (sale, adjustment/count/transfer OUT). `quantity`
   * must be positive (the quantity being removed) - this method negates it
   * before writing. Returns `cogsAmount` = quantity x the average cost that
   * was in effect at the moment of removal (average_cost never changes on
   * an outgoing movement, so the value `recordMovement` returns after the
   * write IS that cost, not a stale pre-write read).
   */
  async recordIssue(
    tx: TenantClient,
    companyId: string,
    params: ValuationMovementParams & { quantity: number },
  ) {
    const { movement, quantityOnHand, averageCost } = await this.inventoryService.recordMovement(
      tx,
      companyId,
      { ...params, quantity: -Math.abs(params.quantity) },
    );
    const unitCost = Number(averageCost);
    return {
      movement,
      quantityOnHand,
      averageCost: unitCost,
      cogsAmount: round2(Math.abs(params.quantity) * unitCost),
    };
  }

  /**
   * Milestone 7 (docs/ACCOUNTING.md "Inventory Adjustment Accounting" /
   * "Stock Count Accounting"): thin wrapper, same shape as recordReceipt -
   * see InventoryService.recordMovementWithValueDelta for the actual
   * pre-read/lock mechanics (kept there, next to recordMovement itself, so
   * there is exactly one place that touches stock_levels with raw SQL).
   */
  async recordValuedAdjustment(
    tx: TenantClient,
    companyId: string,
    params: ValuationMovementParams & { quantity: number; unitCost?: number },
  ) {
    const { movement, quantityOnHand, averageCost, valueDelta } =
      await this.inventoryService.recordMovementWithValueDelta(tx, companyId, params);
    return { movement, quantityOnHand, averageCost: Number(averageCost), valueDelta };
  }
}
