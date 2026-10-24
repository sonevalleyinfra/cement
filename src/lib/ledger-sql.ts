import { sql } from "drizzle-orm";
import { ledgerEntries, receipts } from "@/db/schema";

// SQL pieces only (no `@/db` import), so code that runs inside a given transaction can use them too.

/**
 * The moment a ledger row counts at (ledger, aging, statement). A payment credit (`receipt_credit`,
 * minus) whose payment was received on an earlier India day than the row was posted counts at the last
 * millisecond of that received day; every other row (dispatches, adjustments, reversals, and the old
 * + receipt_credit reversal rows) counts at `created_at`. Exactly mirrors `paymentMoment` in
 * lib/receipt-rules.ts. Needs `leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))`.
 */
export const ledgerMomentSql = sql<Date>`case when ${ledgerEntries.kind} = 'receipt_credit' and ${ledgerEntries.amountPaise} < 0 and ${receipts.receivedOn} < (${ledgerEntries.createdAt} at time zone 'Asia/Kolkata')::date then ((${receipts.receivedOn} + 1)::timestamp at time zone 'Asia/Kolkata') - interval '1 millisecond' else ${ledgerEntries.createdAt} end`.mapWith(
  ledgerEntries.createdAt,
);

/** True when the row counts on an earlier day than it was posted (show its date only, no time). */
export const ledgerBackdatedSql = sql<boolean>`coalesce(${ledgerEntries.kind} = 'receipt_credit' and ${ledgerEntries.amountPaise} < 0 and ${receipts.receivedOn} < (${ledgerEntries.createdAt} at time zone 'Asia/Kolkata')::date, false)`.mapWith(
  Boolean,
);

/**
 * For a `dispatch_reversal` row: when the load it reverses was dispatched (= that load's order_debit
 * moment), so aging cancels that load's debit (`reversesAt` in lib/due-items.ts). Null for every other row.
 * The outer column is written out in full on purpose: inside a raw subquery drizzle may print
 * `${ledgerEntries.dispatchId}` unqualified, which would then mean the inner table's column.
 */
export const ledgerReversesAtSql = sql<Date | null>`(select o.created_at from dispatches r join dispatches o on o.id = r.reverses_dispatch_id where r.id = "ledger_entries"."dispatch_id")`.mapWith(
  ledgerEntries.createdAt,
);
