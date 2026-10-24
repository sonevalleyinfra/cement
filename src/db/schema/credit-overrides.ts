import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { OVERRIDE_REASONS } from "../../lib/reason-codes";
import { CREDIT_STATUSES } from "../../lib/shop-lists";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { orders } from "./orders";
import { retailers } from "./retailers";

/**
 * An order approved over the credit check (v2 B1, soft block): over the limit, overdue, or the shop on
 * hold / blocked. One row per order (orders are approved once), with the numbers the server saw at that
 * moment (credit-check-rules assessCredit). `overLimitPaise` = the part of THIS order over the limit, so
 * consecutive overrides of one shop never count twice (0 for an overdue / hold override).
 * Append-only: a database trigger refuses UPDATE, DELETE and TRUNCATE (drizzle/0042).
 */
export const creditOverrides = pgTable(
  "credit_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    reasonCode: text("reason_code").notNull(),
    note: text("note").default("").notNull(),
    /** This order: bags × rate. */
    orderPaise: bigint("order_paise", { mode: "number" }).notNull(),
    /** Exposure after this order (dues + not sent + this order). */
    afterPaise: bigint("after_paise", { mode: "number" }).notNull(),
    /** The shop's limit then (null = no limit set). */
    limitPaise: bigint("limit_paise", { mode: "number" }),
    overLimitPaise: bigint("over_limit_paise", { mode: "number" }).default(0).notNull(),
    oldestOverdueDays: integer("oldest_overdue_days").default(0).notNull(),
    /** The credit days that applied (the shop's own, or 30). */
    creditDays: integer("credit_days").notNull(),
    creditStatus: text("credit_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("credit_overrides_created_idx").on(t.createdAt),
    check("credit_overrides_reason_code_valid", oneOf(t.reasonCode, OVERRIDE_REASONS.map((o) => o.code))),
    check("credit_overrides_over_limit_valid", sql`${t.overLimitPaise} >= 0`),
    check("credit_overrides_credit_status_valid", oneOf(t.creditStatus, CREDIT_STATUSES)),
  ],
);
