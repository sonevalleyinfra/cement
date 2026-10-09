import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { firms } from "./firms";
import { orders } from "./orders";
import { stockLocations } from "./stock";
import { vehicles } from "./vehicles";

/**
 * One truck load of an order (an order can be split across several dispatches).
 * `ratePaise` is only set when logistics changed the rate at this dispatch;
 * the reason for the change is saved on the order history.
 */
export const dispatches = pgTable(
  "dispatches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    bags: integer("bags").notNull(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    driverName: text("driver_name").notNull(),
    driverPhone: text("driver_phone").default("").notNull(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => stockLocations.id),
    ratePaise: integer("rate_paise"),
    dispatchedBy: text("dispatched_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("dispatches_order_idx").on(t.orderId),
    index("dispatches_firm_idx").on(t.firmId),
    check("dispatches_bags_positive", sql`${t.bags} > 0`),
    check("dispatches_rate_positive", sql`${t.ratePaise} is null or ${t.ratePaise} > 0`),
  ],
);
