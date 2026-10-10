import { boolean, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

/**
 * The product catalogue lists, managed by admin with drop-downs:
 * Brand (Prism) → Channel (trade / non-trade, a fixed list) → Type (OPC / PPC) → Grade (33 / 43 / 53).
 * A product (see `products` in firms.ts) is one combination of these. Items are switched off, never deleted.
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
