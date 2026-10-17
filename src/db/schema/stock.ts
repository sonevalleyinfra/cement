import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { MOVEMENT_TYPES } from "../../lib/stock-rules";
import { oneOf } from "../check-helpers";
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
 * Enforced by DB triggers (drizzle/0037_books_append_only.sql).
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
    /** opening | purchase | dispatch | adjustment | transfer (MOVEMENT_TYPES in lib/stock-rules.ts) */
    type: text("type").notNull(),
    bags: integer("bags").notNull(),
    orderId: uuid("order_id").references(() => orders.id),
    reason: text("reason").default("").notNull(),
    /** Purchases only: what one bag cost, in paise (used for the average purchase cost per product). */
    unitCostPaise: integer("unit_cost_paise"),
    actorId: text("actor_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("stock_movements_godown_idx").on(t.godownId, t.productId),
    index("stock_movements_vehicle_idx").on(t.vehicleId, t.productId),
    check("stock_movements_bags_not_zero", sql`${t.bags} <> 0`),
    check("stock_movements_unit_cost_positive", sql`${t.unitCostPaise} is null or ${t.unitCostPaise} > 0`),
    check("stock_movements_one_place", sql`num_nonnulls(${t.godownId}, ${t.vehicleId}) = 1`),
    check("stock_movements_type_valid", oneOf(t.type, MOVEMENT_TYPES)),
    check("stock_movements_actor_required", sql`${t.actorId} is not null`),
  ],
);
