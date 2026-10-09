import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Shops that buy cement. Shared by all firms. `phone` is 10 plain digits. */
export const retailers = pgTable("retailers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  place: text("place").default("").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
