import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { PAYMENT_MODES, RECEIPT_STATUSES } from "../../lib/receipt-rules";
import { WALLET_KINDS } from "../../lib/wallet-rules";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { retailers } from "./retailers";

/**
 * One receipt = one money event from one retailer. It pays that retailer's one ledger
 * (one `receipt_credit` row of minus the total). `totalPaise` is integer paise.
 * `mode`: cash | online | cheque. `status`: for cheques pending | cleared | bounced,
 * cash is "received", online is "unverified" then "verified". Any receipt can become
 * "reversed" (accounts took it back); `reversedAt`, `reversedBy` and `reversalReason` say when, who and why.
 */
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptNo: integer("receipt_no").generatedAlwaysAsIdentity().notNull(),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id),
    mode: text("mode").notNull(),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
    utr: text("utr"),
    chequeNumber: text("cheque_number"),
    /** YYYY-MM-DD */
    chequeDate: text("cheque_date"),
    bankName: text("bank_name"),
    /** received | unverified | verified | pending | cleared | bounced | reversed */
    status: text("status").notNull(),
    receivedBy: text("received_by")
      .notNull()
      .references(() => user.id),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: text("reversed_by").references(() => user.id),
    reversalReason: text("reversal_reason").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("receipts_retailer_idx").on(t.retailerId, t.createdAt),
    index("receipts_created_idx").on(t.createdAt),
    check("receipts_total_positive", sql`${t.totalPaise} > 0`),
    check("receipts_mode_valid", oneOf(t.mode, PAYMENT_MODES)),
    check("receipts_status_valid", oneOf(t.status, RECEIPT_STATUSES)),
  ],
);

/**
 * Cash wallet, one per collector (staff member). Append-only: rows are never edited or deleted.
 * `amountPaise` is a positive size; `kind` decides the direction (see lib/wallet-rules.ts).
 * `refId` points a confirmed / rejected row at the handover request it answers.
 */
export const walletMovements = pgTable(
  "wallet_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectorId: text("collector_id")
      .notNull()
      .references(() => user.id),
    /** collected | handover_request | handover_confirmed | handover_rejected | reversed */
    kind: text("kind").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    receiptId: uuid("receipt_id").references(() => receipts.id),
    refId: uuid("ref_id"),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("wallet_movements_collector_idx").on(t.collectorId, t.createdAt),
    check("wallet_movements_amount_not_negative", sql`${t.amountPaise} >= 0`),
    check("wallet_movements_kind_valid", oneOf(t.kind, WALLET_KINDS)),
  ],
);
