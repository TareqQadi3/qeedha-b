-- Concurrency guard for Accounting Opening Balance (docs/ACCOUNTING.md
-- "Opening Balance concurrency"): a partial unique index ensures at most one
-- *active* OpeningBalance JournalEntry (posted AND not itself a reversal) can
-- ever exist per company, even under a true concurrent double-submit - the
-- losing transaction's INSERT hits this constraint and
-- OpeningBalanceService.create() translates it into a 409. Same family of
-- protection as the clientReferenceId unique indexes already guarding
-- Sale/Purchase/Expense creation against duplicate submission.
--
-- reversal_of_entry_id IS NULL is required in the predicate: a reversal entry
-- also has status='posted' permanently (reversal-not-mutation - it is never
-- itself marked reversed), so without this it would forever collide with any
-- later fresh opening balance posted after a reversal.
CREATE UNIQUE INDEX "journal_entries_one_active_opening_balance"
  ON "journal_entries" ("company_id")
  WHERE "reference_type" = 'OpeningBalance' AND "status" = 'posted' AND "reversal_of_entry_id" IS NULL;
