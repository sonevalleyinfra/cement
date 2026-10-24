import { bigint, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { LEDGER_KINDS } from "../../lib/ledger-rules";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { orders } from "./orders";
import { retailers } from "./retailers";

/**
 * Retailer ledger, one per retailer. Append-only: rows are never edited
 * or deleted, a mistake is fixed by adding a new compensating row.
 * Enforced by DB triggers (drizzle/0037_books_append_only.sql).
 *
 * `amountPaise` is SIGNED: positive = the retailer owes more (debit),
 * negative = the retailer owes less (credit). Balance = sum of the amounts.
 * `receiptId` is a plain uuid (no foreign key, to keep this table independent).
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id),
    /**
     * opening | order_debit | receipt_credit | adjustment | receipt_reversal (+amount, a payment put
     * back on the bill). Reversals before 0039 are `receipt_credit` rows with a + amount.
     */
    kind: text("kind").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    orderId: uuid("order_id").references(() => orders.id),
    receiptId: uuid("receipt_id"),
    note: text("note").default("").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ledger_entries_retailer_idx").on(t.retailerId, t.createdAt),
    index("ledger_entries_order_idx").on(t.orderId),
    uniqueIndex("ledger_entries_one_opening_idx")
      .on(t.retailerId)
      .where(sql`${t.kind} = 'opening'`),
    check("ledger_entries_kind_valid", oneOf(t.kind, LEDGER_KINDS)),
    check("ledger_entries_amount_not_zero", sql`${t.amountPaise} <> 0`),
    check(
      "ledger_entries_reversal_shape",
      sql`${t.kind} <> 'receipt_reversal' or (${t.amountPaise} > 0 and ${t.receiptId} is not null)`,
    ),
  ],
);
