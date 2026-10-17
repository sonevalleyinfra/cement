import { sql } from "drizzle-orm";
import { bigint, check, date, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { SUPPLIER_KINDS, SUPPLIER_PAYMENT_MODES } from "../../lib/supplier-rules";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { brands } from "./catalogue";
import { stockMovements } from "./stock";

/**
 * Supplier accounts, one per brand: what the business owes each brand's company ("Prism account",
 * "UltraTech account"). Every row belongs to one brand. Append-only: rows are never edited or
 * deleted, a mistake is fixed by adding an adjustment with a reason.
 * Enforced by DB triggers (drizzle/0037_books_append_only.sql).
 * (Called `prism_ledger_entries` before brands came back; migration 0034 renamed it.)
 *
 * `amountPaise` is SIGNED: positive = we owe the supplier more, negative = we owe less.
 * Balance of a brand = sum of its amounts. A purchase links to the stock movement that added the bags
 * and goes to the brand of the purchased product.
 * `entryDate` is the calendar day (India) the owner picked; statements use it.
 */
export const supplierLedgerEntries = pgTable(
  "supplier_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
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
    index("supplier_ledger_entries_date_idx").on(t.entryDate, t.createdAt),
    // One brand's account page and statement.
    index("supplier_ledger_entries_brand_date_idx").on(t.brandId, t.entryDate, t.createdAt),
    // One opening balance per brand.
    uniqueIndex("supplier_ledger_entries_one_opening_idx")
      .on(t.brandId)
      .where(sql`${t.kind} = 'opening'`),
    check("supplier_ledger_entries_kind_valid", oneOf(t.kind, SUPPLIER_KINDS)),
    check("supplier_ledger_entries_amount_not_zero", sql`${t.amountPaise} <> 0`),
    // Signs: a purchase adds to what we owe; a payment or credit lowers it.
    check(
      "supplier_ledger_entries_sign_valid",
      sql`(${t.kind} <> 'purchase' or ${t.amountPaise} > 0) and (${t.kind} not in ('payment', 'credit') or ${t.amountPaise} < 0)`,
    ),
    check(
      "supplier_ledger_entries_mode_valid",
      sql`(${t.kind} = 'payment') = (${t.mode} is not null) and (${t.mode} is null or ${oneOf(t.mode, SUPPLIER_PAYMENT_MODES)})`,
    ),
  ],
);
