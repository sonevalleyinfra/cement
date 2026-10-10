import { sql } from "drizzle-orm";
import { bigint, check, date, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { PRISM_KINDS, PRISM_PAYMENT_MODES } from "../../lib/prism-rules";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { stockMovements } from "./stock";

/**
 * The Prism account: what the business owes Prism (the supplier). Append-only: rows are never
 * edited or deleted, a mistake is fixed by adding an adjustment with a reason.
 *
 * `amountPaise` is SIGNED: positive = we owe Prism more, negative = we owe less.
 * Balance = sum of the amounts. A purchase links to the stock movement that added the bags.
 * `entryDate` is the calendar day (India) the owner picked; statements use it.
 */
export const prismLedgerEntries = pgTable(
  "prism_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** opening | purchase | payment | credit | adjustment */
    kind: text("kind").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    entryDate: date("entry_date", { mode: "string" })
      .default(sql`(timezone('Asia/Kolkata', now()))::date`)
      .notNull(),
    stockMovementId: uuid("stock_movement_id").references(() => stockMovements.id),
    /** Payments only: bank | cash | other */
    mode: text("mode"),
    /** Payment reference (UTR) or the purchase invoice number. */
    reference: text("reference").default("").notNull(),
    /** The reason (credit, adjustment) or a short description. */
    note: text("note").default("").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("prism_ledger_entries_date_idx").on(t.entryDate, t.createdAt),
    uniqueIndex("prism_ledger_entries_one_opening_idx")
      .on(t.kind)
      .where(sql`${t.kind} = 'opening'`),
    check("prism_ledger_entries_kind_valid", oneOf(t.kind, PRISM_KINDS)),
    check("prism_ledger_entries_amount_not_zero", sql`${t.amountPaise} <> 0`),
    // Signs: a purchase adds to what we owe; a payment or credit lowers it.
    check(
      "prism_ledger_entries_sign_valid",
      sql`(${t.kind} <> 'purchase' or ${t.amountPaise} > 0) and (${t.kind} not in ('payment', 'credit') or ${t.amountPaise} < 0)`,
    ),
    check(
      "prism_ledger_entries_mode_valid",
      sql`(${t.kind} = 'payment') = (${t.mode} is not null) and (${t.mode} is null or ${oneOf(t.mode, PRISM_PAYMENT_MODES)})`,
    ),
  ],
);
