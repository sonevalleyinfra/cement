import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { orders } from "./orders";
import { godowns } from "./stock";
import { vehicles } from "./vehicles";

/**
 * One truck load of an order (an order can be split across several dispatches).
 * The bags come from a godown (`fromGodownId`) or a truck (`fromVehicleId`): exactly one is set.
 * `vehicleId` is the truck that carries them to the shop.
 * `ratePaise` is only set when logistics changed the rate at this dispatch;
 * the reason for the change is saved on the order history.
 */
export const dispatches = pgTable(
  "dispatches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    bags: integer("bags").notNull(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    driverName: text("driver_name").notNull(),
    driverPhone: text("driver_phone").default("").notNull(),
    fromGodownId: uuid("from_godown_id").references(() => godowns.id),
    fromVehicleId: uuid("from_vehicle_id").references(() => vehicles.id),
    ratePaise: integer("rate_paise"),
    dispatchedBy: text("dispatched_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("dispatches_order_idx").on(t.orderId),
    check("dispatches_bags_positive", sql`${t.bags} > 0`),
    check("dispatches_rate_positive", sql`${t.ratePaise} is null or ${t.ratePaise} > 0`),
    check("dispatches_one_source", sql`num_nonnulls(${t.fromGodownId}, ${t.fromVehicleId}) = 1`),
  ],
);
