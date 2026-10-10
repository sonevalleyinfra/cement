import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { firms, products } from "./firms";
import { orders } from "./orders";
import { vehicles } from "./vehicles";

/**
 * Godowns (warehouses): one shared list for all firms, kept by admin. Vehicles are the other kind of place.
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
 * One firm's bags at one place (a godown or a vehicle). Made automatically the first time bags of
 * that firm arrive there (see `getLocation` in lib/stock-places), so firms never mix stock.
 * Exactly one of `godownId` / `vehicleId` is set. `name` is a copy for old rows; show the place's own name.
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
    godownId: uuid("godown_id").references(() => godowns.id),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("stock_locations_firm_idx").on(t.firmId),
    check("stock_locations_kind_valid", oneOf(t.kind, ["godown", "vehicle"])),
    check(
      "stock_locations_one_place",
      sql`(${t.kind} = 'godown' and ${t.godownId} is not null and ${t.vehicleId} is null) or (${t.kind} = 'vehicle' and ${t.vehicleId} is not null and ${t.godownId} is null)`,
    ),
    uniqueIndex("stock_locations_firm_godown_unique").on(t.firmId, t.godownId),
    uniqueIndex("stock_locations_firm_vehicle_unique").on(t.firmId, t.vehicleId),
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
