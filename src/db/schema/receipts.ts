import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { PAYMENT_REASON_CODES } from "../../lib/reason-codes";
import { PAYMENT_MODES, RECEIPT_STATUSES } from "../../lib/receipt-rules";
import { WALLET_KINDS } from "../../lib/wallet-rules";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { retailers } from "./retailers";

/**
 * One receipt = one payment from one retailer (rules in lib/receipt-rules.ts). `totalPaise` is integer paise.
 * `mode`: cash | online. Cash is "received" and credits the retailer's ledger at once. Online is
 * "unverified" until accounts check the bank statement: "verified" (the ledger credit is posted then)
 * or "rejected" (`rejectReason`); `checkedBy` / `checkedAt` say who and when.
 * A received or verified payment can become "reversed"; `reversedAt`, `reversedBy` and `reversalReason`
 * say when, who and why. `reasonCode` (lib/reason-codes.ts, payment list) is the picked "why" of a
 * reject or reversal; `rejectReason` / `reversalReason` then hold the optional note (rows from before
 * 0039 have no code and the free text there). `utr` is stored without spaces in capitals and is unique among online
 * payments that still stand (a rejected or reversed payment frees its UTR).
 * Never deleted: enforced by DB triggers (drizzle/0037_books_append_only.sql).
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
    /** Optional note typed with an online payment. */
    note: text("note").default("").notNull(),
    /** received | unverified | verified | rejected | reversed */
    status: text("status").notNull(),
    receivedBy: text("received_by")
      .notNull()
      .references(() => user.id),
    checkedBy: text("checked_by").references(() => user.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    rejectReason: text("reject_reason").default("").notNull(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: text("reversed_by").references(() => user.id),
    reversalReason: text("reversal_reason").default("").notNull(),
    reasonCode: text("reason_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("receipts_retailer_idx").on(t.retailerId, t.createdAt),
    index("receipts_created_idx").on(t.createdAt),
    uniqueIndex("receipts_utr_unique_idx")
      .on(t.utr)
      .where(sql`${t.mode} = 'online' and ${t.status} not in ('rejected', 'reversed')`),
    check("receipts_total_positive", sql`${t.totalPaise} > 0`),
    check("receipts_utr_online_only", sql`(${t.mode} = 'online') = (${t.utr} is not null and ${t.utr} <> '')`),
    check("receipts_mode_valid", oneOf(t.mode, PAYMENT_MODES)),
    check("receipts_status_valid", oneOf(t.status, RECEIPT_STATUSES)),
    check("receipts_reason_code_valid", sql`${t.reasonCode} is null or ${oneOf(t.reasonCode, PAYMENT_REASON_CODES)}`),
    // NOT VALID in drizzle/0039: old rejected / reversed rows (final, never updated again) are skipped.
    check("receipts_reason_code_required", sql`${t.status} not in ('rejected', 'reversed') or ${t.reasonCode} is not null`),
  ],
);

/**
 * Cash wallet, one per collector (staff member). Append-only: rows are never edited or deleted.
 * `amountPaise` is a positive size; `kind` decides the direction (see lib/wallet-rules.ts).
 * `refId` points a confirmed / rejected row at the handover request it answers. A confirmed row
 * holds the amount actually received (it may be less than the request); a rejected row holds
 * the reason in `note`.
 * Enforced by DB triggers (drizzle/0037_books_append_only.sql).
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
    note: text("note").default("").notNull(),
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
