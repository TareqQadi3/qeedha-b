import { IsDateString, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { ACCOUNT_CODES } from '../constants/default-chart-of-accounts';

/** Only the two cash-like accounts this system has - see docs/ACCOUNTING.md "Bank Reconciliation". */
const RECONCILABLE_ACCOUNT_CODES = [ACCOUNT_CODES.CASH, ACCOUNT_CODES.BANK] as const;

/**
 * Milestone 7 (docs/ACCOUNTING.md "Bank Reconciliation"): a minimal,
 * header-only reconciliation record - create IS complete (no draft/confirm
 * two-step, immutable once created, same as AuditLog). `bookBalance` is
 * never trusted from the client - BankReconciliationService always computes
 * it server-side from posted JournalLines as of `asOfDate`.
 */
export class CreateBankReconciliationDto {
  @IsIn(RECONCILABLE_ACCOUNT_CODES)
  accountCode: string;

  @IsDateString()
  asOfDate: string;

  @IsNumber()
  statementBalance: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
