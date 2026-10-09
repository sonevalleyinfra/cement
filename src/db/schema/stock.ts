import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { firms, products } from "./firms";
import { orders } from "./orders";
import { vehicles } from "./vehicles";

/**
 * Places where a firm's bags can be: a godown or a vehicle.
 * The physical godown is shared, but each firm has its own location row, so stock stays separate.
 * A vehicle location has `vehicleId` set. (No godown is seeded; admin adds it.)
 */
export const stockLocations = pgTable(
  "stock_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    kind: text("kind").notNull(), // "godown" | "vehicle"
    name: text("name").notNull(),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("stock_locations_firm_idx").on(t.firmId),
    check("stock_locations_kind_valid", oneOf(t.kind, ["godown", "vehicle"])),
  ],
);

/**
 * Append-only stock ledger. `bags` is signed (+ in, - out). Rows are NEVER updated or
 * deleted: fix mistakes by adding a new movement (reversal or adjustment).
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => stockLocations.id),
    type: text("type").notNull(), // opening | purchase | dispatch | dispatch_reversal | adjustment | transfer
    bags: integer("bags").notNull(),
    orderId: uuid("order_id").references(() => orders.id),
    reason: text("reason").default("").notNull(),
    actorId: text("actor_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("stock_movements_balance_idx").on(t.firmId, t.productId, t.locationId),
    check("stock_movements_bags_not_zero", sql`${t.bags} <> 0`),
  ],
);
