import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { BAG_SIZES_KG, PRODUCT_CHANNELS } from "../../lib/catalogue-rules";
import { FIRM_SLOTS } from "../../lib/firm-rules";
import { oneOf } from "../check-helpers";
import { user } from "./auth";
import { brands, grades } from "./catalogue";

/**
 * The businesses. `slot` picks the accent colour (a to f) in the UI; two firms may share one
 * when there are more than six. A removed firm keeps its records and has `active` false.
 * Basic details are optional and stored as "" when empty. `phone` is 10 plain digits.
 */
export const firms = pgTable("firms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slot: text("slot", { enum: FIRM_SLOTS }).notNull(),
  ownerName: text("owner_name").default("").notNull(),
  phone: text("phone").default("").notNull(),
  gstin: text("gstin").default("").notNull(),
  address: text("address").default("").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One sellable kind of bag, shared by all firms: brand + channel + grade (which carries the type) + bag size.
 * `name` is built by `productName()` in catalogue-rules, never typed. Stock is counted in bags.
 * Products are switched off, never edited, because stock and orders point at them.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    channel: text("channel").notNull(), // "trade" | "non_trade"
    gradeId: uuid("grade_id")
      .notNull()
      .references(() => grades.id),
    bagKg: integer("bag_kg").default(50).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("products_parts_unique").on(t.brandId, t.channel, t.gradeId, t.bagKg),
    check("products_channel_valid", oneOf(t.channel, PRODUCT_CHANNELS)),
    check("products_bag_kg_valid", sql`${t.bagKg} in (${sql.raw(BAG_SIZES_KG.join(", "))})`),
  ],
);

/** Which firms a user may work on. Admin does not need rows here (sees every firm). */
export const userFirms = pgTable(
  "user_firms",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.firmId] }),
    index("user_firms_firm_idx").on(table.firmId),
  ],
);
