import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { CLAIM_STATUSES } from "../../lib/purchase-rules";
import { STOCK_REASON_CODES } from "../../lib/reason-codes";
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
    /** Adjustments: the picked "why" (lib/reason-codes.ts, stock list); `reason` keeps the text. Null before 0039. */
    reasonCode: text("reason_code"),
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
    check("stock_movements_reason_code_valid", sql`${t.reasonCode} is null or ${oneOf(t.reasonCode, STOCK_REASON_CODES)}`),
    // NOT VALID in drizzle/0039: old adjustments (append-only) are skipped.
    check("stock_movements_reason_code_required", sql`${t.type} <> 'adjustment' or ${t.reasonCode} is not null`),
  ],
);

/**
 * The header of a purchase (one per purchase movement, from drizzle/0040): the supplier's invoice,
 * the truck and driver, billed vs received bags and what we paid on top (freight, unloading).
 * The purchase movement adds the billed bags; short and burst bags are taken out by the linked
 * adjustments (transit_short / transit_burst). Landed cost per good bag = lib/money.ts `landedUnitCostPaise`.
 * Purchases saved before 0040 have no header ("not recorded"): readers fall back to the movement.
 * Append-only except the claim columns (claim_status, claim_updated_at, claim_updated_by): DB triggers in 0040.
 */
export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockMovementId: uuid("stock_movement_id")
      .notNull()
      .unique()
      .references(() => stockMovements.id),
    invoiceNo: text("invoice_no").notNull(),
    /** The calendar day on the supplier's invoice (India); the supplier entry is dated on it. */
    invoiceDate: date("invoice_date").notNull(),
    truckNumber: text("truck_number").notNull(),
    driverName: text("driver_name").notNull(),
    driverPhone: text("driver_phone").notNull(),
    billedBags: integer("billed_bags").notNull(),
    shortBags: integer("short_bags").default(0).notNull(),
    burstBags: integer("burst_bags").default(0).notNull(),
    receivedBags: integer("received_bags").notNull(),
    freightPaise: integer("freight_paise").default(0).notNull(),
    unloadingPaise: integer("unloading_paise").default(0).notNull(),
    landedUnitCostPaise: integer("landed_unit_cost_paise").notNull(),
    shortMovementId: uuid("short_movement_id").references(() => stockMovements.id),
    burstMovementId: uuid("burst_movement_id").references(() => stockMovements.id),
    /** none | open | claimed | credited (CLAIM_STATUSES in lib/purchase-rules.ts). */
    claimStatus: text("claim_status").notNull(),
    claimUpdatedAt: timestamp("claim_updated_at", { withTimezone: true }),
    claimUpdatedBy: text("claim_updated_by").references(() => user.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("purchases_claim_idx").on(t.claimStatus).where(sql`${t.claimStatus} in ('open', 'claimed')`),
    check("purchases_invoice_no_valid", sql`char_length(${t.invoiceNo}) between 1 and 60 and ${t.invoiceNo} = btrim(${t.invoiceNo})`),
    check("purchases_driver_phone_valid", sql`${t.driverPhone} ~ '^[6-9][0-9]{9}$'`),
    check("purchases_billed_positive", sql`${t.billedBags} > 0`),
    check("purchases_short_not_negative", sql`${t.shortBags} >= 0`),
    check("purchases_burst_not_negative", sql`${t.burstBags} >= 0`),
    check(
      "purchases_received_valid",
      sql`${t.receivedBags} = ${t.billedBags} - ${t.shortBags} - ${t.burstBags} and ${t.receivedBags} > 0`,
    ),
    check("purchases_freight_not_negative", sql`${t.freightPaise} >= 0`),
    check("purchases_unloading_not_negative", sql`${t.unloadingPaise} >= 0`),
    check("purchases_landed_positive", sql`${t.landedUnitCostPaise} > 0`),
    check("purchases_short_movement", sql`(${t.shortMovementId} is null) = (${t.shortBags} = 0)`),
    check("purchases_burst_movement", sql`(${t.burstMovementId} is null) = (${t.burstBags} = 0)`),
    check("purchases_claim_status_valid", oneOf(t.claimStatus, CLAIM_STATUSES)),
    check("purchases_claim_matches_bags", sql`(${t.shortBags} + ${t.burstBags} = 0) = (${t.claimStatus} = 'none')`),
  ],
);
