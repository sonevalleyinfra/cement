import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { DELIVER_TO, ORDER_SOURCES } from "../../lib/order-delivery-rules";
import { ORDER_STATUSES } from "../../lib/order-rules";
import { ORDER_EVENT_REASON_CODES } from "../../lib/reason-codes";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { products } from "./catalogue";
import { retailers } from "./retailers";

/**
 * One order = one product for one retailer.
 * `ratePaise` is the current price per bag in paise; empty until the sales person fills it.
 * It may change after approval; each dispatch saves the rate it was billed at.
 * `salesRepId` is the retailer's sales person when the order was placed (see sales-rep-rules.ts).
 * Delivery (order-delivery-rules.ts): `deliverTo` shop | site; a site has `siteAddress`; the receiver's
 * name / phone and `requiredBy` (India date) are optional. `source` = where the order came from; null
 * only on orders placed before it was recorded (0039). `shopNote` is visible to the shop; `staffNote`
 * is NEVER sent to a shop (notesForViewer).
 * Never deleted: enforced by DB triggers (drizzle/0037_books_append_only.sql).
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
    /** Legacy: copied to staff_note / shop_note by 0039; never read; drop in a later migration. */
    notes: text("notes").default("").notNull(),
    deliverTo: text("deliver_to").default("shop").notNull(),
    siteAddress: text("site_address"),
    receiverName: text("receiver_name"),
    receiverPhone: text("receiver_phone"),
    requiredBy: date("required_by", { mode: "string" }),
    source: text("source"),
    staffNote: text("staff_note").default("").notNull(),
    shopNote: text("shop_note").default("").notNull(),
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
    check("orders_deliver_to_valid", oneOf(t.deliverTo, DELIVER_TO)),
    check(
      "orders_site_address_required",
      sql`${t.deliverTo} = 'shop' or (${t.siteAddress} is not null and btrim(${t.siteAddress}) <> '')`,
    ),
    check("orders_receiver_phone_valid", sql`${t.receiverPhone} is null or ${t.receiverPhone} ~ '^[6-9][0-9]{9}$'`),
    // Nullable on purpose: old orders have no source, and a NOT VALID "not null" check would still
    // be checked on every status update of those rows.
    check("orders_source_valid", sql`${t.source} is null or ${oneOf(t.source, ORDER_SOURCES)}`),
  ],
);

/**
 * History: one row for every status change (including the first "placed"), and for every rate
 * fill or change (status stays the same; the reason says "Rate filled" / "Rate edited: ...").
 * A rate row also keeps the rate before and after (`fromRatePaise` / `toRatePaise`, staff only;
 * empty on other rows and on the first fill's "before").
 * `reasonCode` (lib/reason-codes.ts) is the picked "why" on reject, cancel and rate change rows; `reason`
 * then holds the optional note (a rate row: "Rate edited: <note>"). Rows from before 0039 have no code.
 * Append-only: enforced by DB triggers (drizzle/0037_books_append_only.sql).
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
    reasonCode: text("reason_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("order_events_order_idx").on(t.orderId, t.createdAt),
    check("order_events_reason_code_valid", sql`${t.reasonCode} is null or ${oneOf(t.reasonCode, ORDER_EVENT_REASON_CODES)}`),
    // NOT VALID in drizzle/0039 (old rows are skipped; the table is append-only).
    check(
      "order_events_reason_code_required",
      sql`${t.toStatus} not in ('rejected', 'cancelled') or ${t.reasonCode} is not null`,
    ),
  ],
);
