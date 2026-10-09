import { boolean, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { FIRM_SLOTS } from "../../lib/firm-rules";
import { user } from "./auth";

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

/** Prism Cement products. Shared by all firms. Unit is always bags. */
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
