import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { REVERSAL_REASON_CODES } from "../../lib/reason-codes";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { orders } from "./orders";
import { godowns } from "./stock";
import { vehicles } from "./vehicles";

/**
 * One truck load of an order (an order can be split across several dispatches).
 * The bags come from a godown (`fromGodownId`) or a truck (`fromVehicleId`): exactly one is set.
 * `vehicleId` is the truck that carries them to the shop.
 * `ratePaise` is the rate per bag this load was billed at (the order's rate at that moment).
 * Each dispatch posts one ledger debit: bags x ratePaise.
 * `salesRepId` is the order's sales person at the moment of dispatch, so the sales report by sales person
 * does not change when admin later gives the shop to someone else (empty = nobody).
 * Append-only: enforced by DB triggers (drizzle/0037_books_append_only.sql).
 *
 * Reversal rows (v2 B2, admin only, lib/reversals.ts): `bags` < 0 and `reversesDispatchId` = the load
 * it reverses (never a reversal itself), with a reversal `reasonCode`. It copies the original's order,
 * truck, driver, rate and sales person; `fromGodownId` / `fromVehicleId` on a reversal row is the
 * place the bags went BACK INTO, and `dispatchedBy` is the admin. So sum(bags) of an order is the net
 * sent and sum(bags x rate) the net billed. DB triggers (drizzle/0043) refuse reversing more than the load.
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
    ratePaise: integer("rate_paise").notNull(),
    salesRepId: text("sales_rep_id").references(() => user.id),
    /** Reversal rows only: the load this row reverses. */
    reversesDispatchId: uuid("reverses_dispatch_id").references((): AnyPgColumn => dispatches.id),
    /** Reversal rows only: why (reason-codes.ts, reversal list). */
    reasonCode: text("reason_code"),
    /** Reversal rows only: the optional note. */
    reasonNote: text("reason_note").default("").notNull(),
    dispatchedBy: text("dispatched_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("dispatches_order_idx").on(t.orderId),
    // Reports read dispatches by date.
    index("dispatches_created_idx").on(t.createdAt),
    index("dispatches_reverses_idx").on(t.reversesDispatchId),
    check("dispatches_bags_not_zero", sql`${t.bags} <> 0`),
    check(
      "dispatches_reversal_shape",
      sql`(${t.bags} > 0 and ${t.reversesDispatchId} is null and ${t.reasonCode} is null) or (${t.bags} < 0 and ${t.reversesDispatchId} is not null and ${t.reasonCode} is not null and ${oneOf(t.reasonCode, REVERSAL_REASON_CODES)})`,
    ),
    check("dispatches_rate_positive", sql`${t.ratePaise} > 0`),
    check("dispatches_one_source", sql`num_nonnulls(${t.fromGodownId}, ${t.fromVehicleId}) = 1`),
    // NOT VALID (drizzle/0040, 0043): old dispatches without a phone ('') are skipped; a reversal copies the original's.
    check("dispatches_driver_phone_valid", sql`${t.bags} < 0 or ${t.driverPhone} ~ '^[6-9][0-9]{9}$'`),
  ],
);
