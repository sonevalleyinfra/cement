import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { firms } from "./firms";
import { orders } from "./orders";
import { retailers } from "./retailers";

/**
 * One receipt = one money event from one retailer (it has no firm of its own;
 * the split lives in `receipt_allocations`). `totalPaise` is integer paise.
 * `mode`: cash | online | cheque. `status`: for cheques pending | cleared | bounced,
 * cash is "received", online is "unverified" then "verified".
 */
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptNo: integer("receipt_no").generatedAlwaysAsIdentity().notNull(),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id),
    /** Firm whose bank account received online / cheque money. Empty for cash. */
    receivedFirmId: uuid("received_firm_id").references(() => firms.id),
    mode: text("mode").notNull(),
    totalPaise: integer("total_paise").notNull(),
    utr: text("utr"),
    chequeNumber: text("cheque_number"),
    /** YYYY-MM-DD */
    chequeDate: text("cheque_date"),
    bankName: text("bank_name"),
    /** received | pending | cleared | bounced */
    status: text("status").notNull(),
    receivedBy: text("received_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("receipts_retailer_idx").on(t.retailerId, t.createdAt), index("receipts_created_idx").on(t.createdAt)],
);

/** One row per order paid (or one advance row per firm with no order). Amounts sum to the receipt total. */
export const receiptAllocations = pgTable(
  "receipt_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    orderId: uuid("order_id").references(() => orders.id),
    amountPaise: integer("amount_paise").notNull(),
    advance: boolean("advance").default(false).notNull(),
  },
  (t) => [index("receipt_allocations_receipt_idx").on(t.receiptId), index("receipt_allocations_order_idx").on(t.orderId)],
);

/**
 * Cash wallet, one per collector per firm. Append-only: rows are never edited or deleted.
 * `amountPaise` is a positive size; `kind` decides the direction (see lib/wallet-rules.ts).
 * `refId` points a confirmed / rejected row at the handover request it answers.
 */
export const walletMovements = pgTable(
  "wallet_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    collectorId: text("collector_id")
      .notNull()
      .references(() => user.id),
    /** collected | handover_request | handover_confirmed | handover_rejected */
    kind: text("kind").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    receiptId: uuid("receipt_id").references(() => receipts.id),
    refId: uuid("ref_id"),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("wallet_movements_collector_idx").on(t.collectorId, t.firmId, t.createdAt)],
);
