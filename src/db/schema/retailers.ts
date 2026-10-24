import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { CREDIT_STATUSES, SHOP_CATEGORIES } from "../../lib/shop-lists";
import { oneOf } from "../check-helpers";
import { user } from "./auth";

/**
 * Areas shops are in (admin keeps the list). An area is switched off, never deleted: a shop that
 * already uses an off area keeps it, but it cannot be newly picked.
 */
export const areas = pgTable("areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Shops that buy cement. `phone` is 10 plain digits. The master fields (owner ... credit days) are
 * optional: null = not filled in yet. CHECKs pass on NULL, so they only check values that are set.
 */
export const retailers = pgTable(
  "retailers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull().unique(),
    place: text("place").default("").notNull(),
    /** Optional login for this shop (a user with the retailer role). One login per shop. */
    userId: text("user_id")
      .unique()
      .references(() => user.id, { onDelete: "set null" }),
    /**
     * The sales person who looks after this shop. Every new order of the shop goes to them
     * (they fill the rate). Admin can change it. Empty = nobody yet.
     */
    salesRepId: text("sales_rep_id").references(() => user.id, { onDelete: "set null" }),
    active: boolean("active").default(true).notNull(),
    ownerName: text("owner_name"),
    /** A second 10-digit mobile (not unique: two shops of one family may share it). */
    altPhone: text("alt_phone"),
    address: text("address"),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "restrict" }),
    pincode: text("pincode"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /** When lat/lng were pinned (set by the server). */
    geoCapturedAt: timestamp("geo_captured_at", { withTimezone: true }),
    category: text("category"),
    openedOn: date("opened_on", { mode: "string" }),
    /** Stored only. It is NEVER used for tax: the app does no GST maths. */
    gstin: text("gstin"),
    /** Credit limit in paise. null = no limit set. */
    creditLimitPaise: bigint("credit_limit_paise", { mode: "number" }),
    /** null = not set (the default of 30 days applies, see effectiveCreditDays). */
    creditDays: integer("credit_days"),
    /** hold = no new approvals, blocked = no dispatch either. Enforced later (v2 B1), not yet. */
    creditStatus: text("credit_status").default("ok").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("retailers_pincode_valid", sql`${t.pincode} ~ '^[1-9][0-9]{5}$'`),
    check("retailers_geo_both", sql`(${t.lat} is null) = (${t.lng} is null)`),
    check("retailers_lat_range", sql`${t.lat} between -90 and 90`),
    check("retailers_lng_range", sql`${t.lng} between -180 and 180`),
    check("retailers_category_valid", oneOf(t.category, SHOP_CATEGORIES)),
    check("retailers_gstin_format", sql`${t.gstin} ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`),
    check("retailers_credit_limit_valid", sql`${t.creditLimitPaise} >= 0`),
    check("retailers_credit_days_range", sql`${t.creditDays} between 0 and 365`),
    check("retailers_credit_status_valid", oneOf(t.creditStatus, CREDIT_STATUSES)),
  ],
);

/**
 * Every change of a shop's credit terms (limit, days or status), append-only (a database trigger
 * refuses UPDATE, DELETE and TRUNCATE). One row per save that changed any of them.
 */
export const creditLimitChanges = pgTable(
  "credit_limit_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id),
    changedBy: text("changed_by")
      .notNull()
      .references(() => user.id),
    oldLimitPaise: bigint("old_limit_paise", { mode: "number" }),
    newLimitPaise: bigint("new_limit_paise", { mode: "number" }),
    oldCreditDays: integer("old_credit_days"),
    newCreditDays: integer("new_credit_days"),
    oldStatus: text("old_status").notNull(),
    newStatus: text("new_status").notNull(),
    note: text("note").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("credit_limit_changes_retailer_idx").on(t.retailerId, t.createdAt),
    check("credit_limit_changes_old_status_valid", oneOf(t.oldStatus, CREDIT_STATUSES)),
    check("credit_limit_changes_new_status_valid", oneOf(t.newStatus, CREDIT_STATUSES)),
  ],
);
