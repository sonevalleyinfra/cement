import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { ORDER_STATUSES } from "../../lib/order-rules";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { products } from "./catalogue";
import { retailers } from "./retailers";

/**
 * One order = one product for one retailer.
 * `ratePaise` is the current price per bag in paise; empty until the sales person fills it.
 * It may change after approval; each dispatch saves the rate it was billed at.
 * `salesRepId` is the retailer's sales person when the order was placed (see sales-rep-rules.ts).
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("orders_created_idx").on(t.createdAt),
    index("orders_retailer_idx").on(t.retailerId),
    // Safety rules the database itself enforces.
    check("orders_bags_positive", sql`${t.bags} > 0`),
    check("orders_rate_positive", sql`${t.ratePaise} is null or ${t.ratePaise} > 0`),
    check("orders_status_valid", oneOf(t.status, ORDER_STATUSES)),
  ],
);

/**
 * History: one row for every status change (including the first "placed"), and for every rate
 * fill or change (status stays the same; the reason says "Rate filled" / "Rate edited: ...").
 * A rate row also keeps the rate before and after (`fromRatePaise` / `toRatePaise`, staff only;
 * empty on other rows and on the first fill's "before").
 */
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
    fromRatePaise: integer("from_rate_paise"),
    toRatePaise: integer("to_rate_paise"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);
