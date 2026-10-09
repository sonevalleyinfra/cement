import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { ORDER_STATUSES } from "../../lib/order-rules";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { firms, products } from "./firms";
import { retailers } from "./retailers";

/**
 * One order = one product for one retailer with one firm.
 * `ratePaise` is the price per bag in paise; empty until sales fills the rate.
 * `salesRepId` is the sales person picked by round robin when the order was placed.
 * `logisticsId` is the logistics person picked by round robin when the order was approved.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    bags: integer("bags").notNull(),
    ratePaise: integer("rate_paise"),
    status: text("status").default("placed").notNull(),
    notes: text("notes").default("").notNull(),
    placedBy: text("placed_by")
      .notNull()
      .references(() => user.id),
    salesRepId: text("sales_rep_id").references(() => user.id),
    logisticsId: text("logistics_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("orders_firm_created_idx").on(t.firmId, t.createdAt),
    index("orders_retailer_idx").on(t.retailerId),
    // Safety rules the database itself enforces.
    check("orders_bags_positive", sql`${t.bags} > 0`),
    check("orders_rate_positive", sql`${t.ratePaise} is null or ${t.ratePaise} > 0`),
    check("orders_status_valid", oneOf(t.status, ORDER_STATUSES)),
  ],
);

/** History: one row for every status change (including the first "placed"). */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    reason: text("reason").default("").notNull(),
    /**
     * Who approval's round robin picked. Set only on that "assigned" row, so the next
     * approval's turn does not move when someone else takes the order at dispatch.
     */
    assigneeId: text("assignee_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);
