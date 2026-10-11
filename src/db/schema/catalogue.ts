import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { BAG_SIZES_KG, PRODUCT_CHANNELS } from "../../lib/catalogue-rules";
import { oneOf } from "../check-helpers";

/**
 * The product catalogue lists, managed by admin with drop-downs:
 * Brand (Prism; admin adds more) → Channel (trade / non-trade, a fixed list) → Type (OPC / PPC) → Grade (33 / 43 / 53).
 * Each brand also has its own supplier account (see suppliers.ts).
 * A product (see `products` below) is one combination of these. Items are switched off, never deleted.
 */
export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Cement types, e.g. OPC (Ordinary Portland Cement) and PPC (Portland Pozzolana Cement). */
export const cementTypes = pgTable("cement_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").default("").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Grades of one type, e.g. OPC 33 / 43 / 53. `name` is the grade only ("53"). */
export const grades = pgTable(
  "grades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    typeId: uuid("type_id")
      .notNull()
      .references(() => cementTypes.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("grades_type_name_unique").on(t.typeId, t.name)],
);

/**
 * One sellable kind of bag: brand + channel + grade (which carries the type) + bag size.
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
