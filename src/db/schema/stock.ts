import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { products } from "./catalogue";
import { orders } from "./orders";
import { vehicles } from "./vehicles";

/**
 * Godowns (warehouses), kept by admin. Trucks (`vehicles`) are the other kind of place.
 * Names are unique ignoring capitals. A godown is switched off, never deleted.
 */
export const godowns = pgTable(
  "godowns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    address: text("address").default("").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("godowns_name_lower_unique").on(sql`lower(${t.name})`)],
);

/**
 * Append-only stock ledger. `bags` is signed (+ in, - out). Rows are NEVER updated or
 * deleted: fix mistakes by adding a new movement (reversal or adjustment).
 * The place is a godown OR a truck: exactly one of `godownId` / `vehicleId` is set.
 * Stock = sum of `bags` per product per place.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    godownId: uuid("godown_id").references(() => godowns.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    type: text("type").notNull(), // opening | purchase | dispatch | dispatch_reversal | adjustment | transfer
    bags: integer("bags").notNull(),
    orderId: uuid("order_id").references(() => orders.id),
    reason: text("reason").default("").notNull(),
    actorId: text("actor_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("stock_movements_godown_idx").on(t.godownId, t.productId),
    index("stock_movements_vehicle_idx").on(t.vehicleId, t.productId),
    check("stock_movements_bags_not_zero", sql`${t.bags} <> 0`),
    check("stock_movements_one_place", sql`num_nonnulls(${t.godownId}, ${t.vehicleId}) = 1`),
  ],
);
