import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { firms, products } from "./firms";
import { retailers } from "./retailers";

/**
 * One order = one product for one retailer with one firm.
 * `ratePaise` is the price per bag in paise; empty until sales fills the rate.
 * `salesRepId` is the sales person picked by round robin when the order was placed.
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("orders_firm_created_idx").on(t.firmId, t.createdAt),
    index("orders_retailer_idx").on(t.retailerId),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);
